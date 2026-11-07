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

// The stored switch commits first. The machine moves second, to the stored value.
// The heartbeat reads the stored switch, so it cannot resume a machine that is being switched off.
// A failed write means no machine action. A failed machine action after a committed write
// leaves the stored switch as it is. The error reaches the owner, so the owner sees the switch did not fully apply.
export async function switchAgentMachine(
	machine: AccountMachine | undefined,
	scope: AccountScope,
	agentId: string,
	persist: () => Promise<Fenced<StoredAgentOn>>,
): Promise<Fenced<StoredAgentOn>> {
	const written = await persist();
	if (!machine) return written;
	// The stored value is the truth. On a superseded write it can differ from the request.
	await moveMachine(machine, scope, agentId, written.row.on);
	return written;
}
