import type { AccountScope } from "@tensquads/kernel";

import { chooseAdapters } from "./adapter-choice.ts";

// Typed stub for https://github.com/moeghashim/tensquads/pull/42.
// The merged function starts each real agent. This copy keeps that signature.
// It returns the stored expiries and does not rotate a token.

export interface ProvisionEnv {
	readonly ADAPTERS?: string;
	readonly BOAT_TOKEN?: string;
	readonly BOAT_ADMIN_TOKEN?: string;
	readonly BOAT_PROFILE?: string;
	readonly BOAT_BASE_PATH?: string;
	readonly BOAT_SECRET_BASE_URL?: string;
	readonly MACHINE_TOKEN_KEY?: string;
	readonly fetchApi?: typeof fetch;
	readonly wait?: unknown;
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

export async function provisionAgents(
	env: ProvisionEnv,
	accountId: string,
	nowMs = Date.now(),
	currentExp: Readonly<Record<string, number>> = {},
): Promise<readonly ProvisionedAgent[]> {
	void nowMs;
	void chooseAdapters(env.ADAPTERS);
	return Object.entries(currentExp).map(([agentId, exp]) => ({
		agentId,
		rotated: false,
		exp,
		profile: `tensquads.${accountId.length}.${accountId}.${agentId.length}.${agentId}`,
		snapshot: "",
	}));
}

export async function readLiveMachine(
	_env: ProvisionEnv,
	_scope: AccountScope,
	_agentId: string,
): Promise<LiveMachine | null> {
	return null;
}
