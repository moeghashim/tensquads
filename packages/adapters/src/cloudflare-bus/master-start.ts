import { type BusinessChat, researchStart } from "@tensquads/domain";
import type { PublishedEvent } from "@tensquads/kernel";

import { type ProvisionEnv, type ProvisionedAgent, provisionAgents } from "../provision-agents.ts";
import type { QueueProducer } from "./http.ts";

type StartProvision = (
	env: ProvisionEnv,
	accountId: string,
	nowMs?: number,
	currentExp?: Readonly<Record<string, number>>,
) => Promise<readonly ProvisionedAgent[]>;

export interface MasterStartEnv extends ProvisionEnv {
	readonly provisionAgents?: StartProvision;
}

export const MACHINE_EXP_KEY = "machineExp";

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseMachineExp(value: unknown): Record<string, number> {
	if (!isRecord(value)) return {};
	const map: Record<string, number> = {};
	for (const [key, exp] of Object.entries(value)) {
		if (typeof exp === "number" && Number.isFinite(exp)) map[key] = exp;
	}
	return map;
}

function readMachineExp(store: Readonly<Record<string, unknown>>): Record<string, number> {
	return parseMachineExp(store[MACHINE_EXP_KEY]);
}

function machineExpFrom(rows: readonly { readonly agentId: string; readonly exp: number }[]): Record<string, number> {
	const map: Record<string, number> = {};
	for (const row of rows) map[row.agentId] = row.exp;
	return map;
}

// The send path only queues the start. The queue consumer provisions and publishes the Task.
// The send never waits on provisioning, which can take minutes.
export async function queueMasterStart(queue: QueueProducer, accountId: string, request: BusinessChat): Promise<void> {
	await queue.send({ accountId, start: request });
}

// Always pass the stored map. An omitted map makes provisionAgents rotate every token.
export async function masterStartEvent(
	env: MasterStartEnv,
	accountId: string,
	request: BusinessChat,
	store: Readonly<Record<string, unknown>>,
	nowMs: number,
): Promise<PublishedEvent> {
	const currentExp = readMachineExp(store);
	const provision = env.provisionAgents ?? provisionAgents;
	const rows = await provision(env, accountId, nowMs, currentExp);
	const started = researchStart(request, `business-${accountId}`);
	return {
		...started,
		set: { ...started.set, [MACHINE_EXP_KEY]: machineExpFrom(rows) },
	};
}
