import { type BusinessChat, researchStart } from "@tensquads/domain";
import type { PublishedEvent } from "@tensquads/kernel";

import { type ProvisionEnv, provisionAgents } from "../provision-agents.ts";

export const MACHINE_EXP_KEY = "machineExp";

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseMachineExp(value: unknown): Record<string, number> {
	if (!isRecord(value)) return {};
	const map: Record<string, number> = {};
	for (const [key, exp] of Object.entries(value)) {
		if (typeof exp === "number" && Number.isFinite(exp)) map[key] = exp;
	}
	return map;
}

export function readMachineExp(store: Readonly<Record<string, unknown>>): Record<string, number> {
	return parseMachineExp(store[MACHINE_EXP_KEY]);
}

function machineExpFrom(rows: readonly { readonly agentId: string; readonly exp: number }[]): Record<string, number> {
	const map: Record<string, number> = {};
	for (const row of rows) map[row.agentId] = row.exp;
	return map;
}

// Always pass the stored map. An omitted map makes provisionAgents rotate every token.
export async function masterStartEvent(
	env: ProvisionEnv,
	accountId: string,
	request: BusinessChat,
	store: Readonly<Record<string, unknown>>,
	nowMs: number,
): Promise<PublishedEvent> {
	const currentExp = readMachineExp(store);
	const rows = await provisionAgents(env, accountId, nowMs, currentExp);
	const started = researchStart(request, `business-${accountId}`);
	return {
		...started,
		set: { ...started.set, [MACHINE_EXP_KEY]: machineExpFrom(rows) },
	};
}
