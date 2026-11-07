import type { Fenced, StoredAgentOn } from "@tensquads/domain";
import type { AccountMachine, AccountScope } from "@tensquads/kernel";

import { chooseAdapters } from "./adapter-choice.ts";
import { type AgentModelEnv, agentModelsOf } from "./agent-models.ts";
import { realRunAgent } from "./boat-fields.ts";
import { createBoatMachine } from "./boat-machine.ts";

export interface MachineEnv extends AgentModelEnv {
	readonly ADAPTERS?: string;
	readonly BOAT_TOKEN?: string;
	readonly BOAT_ADMIN_TOKEN?: string;
	readonly BOAT_PROFILE?: string;
	readonly BOAT_BASE_PATH?: string;
	readonly BOAT_SECRET_BASE_URL?: string;
	readonly fetchApi?: typeof fetch;
}

// The boat.dev machine for an account. It throws when the token or profile is missing.
export function liveMachine(env: MachineEnv): AccountMachine {
	return createBoatMachine({
		token: env.BOAT_TOKEN ?? "",
		adminToken: env.BOAT_ADMIN_TOKEN,
		profileName: env.BOAT_PROFILE ?? "",
		basePath: env.BOAT_BASE_PATH,
		secretBaseUrl: env.BOAT_SECRET_BASE_URL,
		agentModels: agentModelsOf(env),
		fetchApi: env.fetchApi,
	});
}

// Only the real run agents have a boat.dev machine. Test mode and other agents get undefined.
export function switchingMachine(env: MachineEnv, agentId: string): AccountMachine | undefined {
	if (chooseAdapters(env.ADAPTERS) !== "real") return undefined;
	if (!realRunAgent(agentId)) return undefined;
	return liveMachine(env);
}

async function moveMachine(machine: AccountMachine, scope: AccountScope, agentId: string, on: boolean): Promise<void> {
	if (on) {
		await machine.resume(scope, agentId);
		return;
	}
	await machine.stop(scope, agentId);
}

// The machine moves first. The database write runs only after the machine moved,
// so a machine failure leaves the stored switch unchanged and the owner sees the error.
// If the write does not commit, the machine moves back to the stored state.
// A failed move back is ignored here, so the original error is the one that reaches the owner.
export async function switchAgentMachine(
	machine: AccountMachine | undefined,
	scope: AccountScope,
	agentId: string,
	on: boolean,
	persist: () => Promise<Fenced<StoredAgentOn>>,
): Promise<Fenced<StoredAgentOn>> {
	if (!machine) return persist();
	await moveMachine(machine, scope, agentId, on);
	let written: Fenced<StoredAgentOn>;
	try {
		written = await persist();
	} catch (error) {
		await moveMachine(machine, scope, agentId, !on).catch(() => undefined);
		throw error;
	}
	if (written.status === "superseded") {
		// Another write won. The machine follows the stored value, not this request.
		await moveMachine(machine, scope, agentId, written.row.on).catch(() => undefined);
	}
	return written;
}
