import { type AccountScope, MachineFault } from "@tensquads/kernel";

import { chooseAdapters } from "./adapter-choice.ts";
import { notConfigured } from "./boat-errors.ts";
import { REAL_RUN_IMAGES, realRunAgent } from "./boat-fields.ts";
import { type BoatMachineOptions, type BoatWait, createBoatMachine } from "./boat-machine.ts";
import { machineCredentialProfile, rotateMachineToken } from "./cloudflare-bus/token.ts";

export interface ProvisionEnv {
	readonly ADAPTERS?: string;
	readonly BOAT_TOKEN?: string;
	readonly BOAT_ADMIN_TOKEN?: string;
	readonly BOAT_PROFILE?: string;
	readonly BOAT_BASE_PATH?: string;
	readonly BOAT_SECRET_BASE_URL?: string;
	readonly MACHINE_TOKEN_KEY?: string;
	readonly fetchApi?: typeof fetch;
	readonly wait?: BoatWait;
}

export interface ProvisionedAgent {
	readonly agentId: string;
	readonly rotated: boolean;
	readonly exp: number;
	readonly profile: string;
	readonly snapshot: string;
}

export interface LiveMachine {
	readonly host: string;
	readonly cpu: string;
	readonly uptime: string;
}

function planned(accountId: string, currentExp: Readonly<Record<string, number>>): ProvisionedAgent[] {
	return REAL_RUN_IMAGES.map((row) => ({
		agentId: row.agentId,
		rotated: false,
		exp: currentExp[row.agentId] ?? 0,
		profile: machineCredentialProfile(accountId, row.agentId),
		snapshot: row.snapshot,
	}));
}

function boatOptions(env: ProvisionEnv, registration: boolean): BoatMachineOptions {
	if (!env.BOAT_TOKEN || !env.BOAT_PROFILE) throw notConfigured();
	if (registration && (!env.BOAT_ADMIN_TOKEN || !env.BOAT_SECRET_BASE_URL)) throw notConfigured();
	return {
		token: env.BOAT_TOKEN,
		adminToken: env.BOAT_ADMIN_TOKEN,
		profileName: env.BOAT_PROFILE,
		basePath: env.BOAT_BASE_PATH,
		secretBaseUrl: env.BOAT_SECRET_BASE_URL,
		fetchApi: env.fetchApi ?? fetch,
		wait: env.wait,
	};
}

export async function provisionAgents(
	env: ProvisionEnv,
	accountId: string,
	nowMs = Date.now(),
	currentExp: Readonly<Record<string, number>> = {},
): Promise<readonly ProvisionedAgent[]> {
	if (chooseAdapters(env.ADAPTERS) !== "real") return planned(accountId, currentExp);
	if (!env.MACHINE_TOKEN_KEY) throw notConfigured();
	const machine = createBoatMachine(boatOptions(env, true));
	const scope: AccountScope = { accountId, mode: "account" };
	const secret = env.MACHINE_TOKEN_KEY;
	const started: ProvisionedAgent[] = [];
	for (const row of REAL_RUN_IMAGES) {
		const turned = await rotateMachineToken(machine, {
			scope,
			agentId: row.agentId,
			secret,
			nowMs,
			currentExp: currentExp[row.agentId],
		});
		await machine.startFromTemplate(scope, row.snapshot, row.agentId);
		started.push({
			agentId: row.agentId,
			rotated: turned.rotated,
			exp: turned.exp,
			profile: turned.profile,
			snapshot: row.snapshot,
		});
	}
	return started;
}

export async function readLiveMachine(
	env: ProvisionEnv,
	scope: AccountScope,
	agentId: string,
): Promise<LiveMachine | null> {
	if (chooseAdapters(env.ADAPTERS) !== "real" || !realRunAgent(agentId)) return null;
	const machine = createBoatMachine(boatOptions(env, false));
	try {
		return {
			host: await machine.host(scope, agentId),
			cpu: await machine.cpu(scope, agentId),
			uptime: await machine.uptime(scope, agentId),
		};
	} catch (error) {
		if (error instanceof MachineFault && error.message === "No machine for this agent.") return null;
		throw error;
	}
}
