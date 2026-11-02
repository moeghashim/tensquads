import type { AccountScope, Autonomy } from "@tensquads/domain";

import { machineAction } from "../../../domain/src/squads/agent-commands.ts";
import type { Repositories } from "../ports.ts";

export interface AgentMachine {
	start(agentId: string): void;
	stop(agentId: string): void;
}

function switchAgent(machine: AgentMachine, agentId: string, on: boolean): void {
	machine[machineAction(on)](agentId);
}

export async function commitAgentOn(
	machine: AgentMachine,
	agentId: string,
	on: boolean,
	persist: () => Promise<void>,
): Promise<void> {
	switchAgent(machine, agentId, on);
	await persist();
}

export interface SquadCommands {
	switchAgent(machine: AgentMachine, agentId: string, on: boolean): void;
	commitAgentOn(machine: AgentMachine, agentId: string, on: boolean, persist: () => Promise<void>): Promise<void>;
	setAgentOn(scope: AccountScope, agentId: string, on: boolean, deadlineAt: number): Promise<void>;
	setSkillOn(scope: AccountScope, agentId: string, skillId: string, on: boolean, deadlineAt: number): Promise<void>;
	setAutonomy(scope: AccountScope, agentId: string, autonomy: Autonomy, deadlineAt: number): Promise<void>;
	askRevise(scope: AccountScope, agentId: string, deadlineAt: number): Promise<void>;
}

interface SquadWrites {
	setAgentOn(scope: AccountScope, agentId: string, on: boolean, deadlineAt?: number): Promise<void>;
	setSkillOn(scope: AccountScope, agentId: string, skillId: string, on: boolean, deadlineAt?: number): Promise<void>;
	setAutonomy(scope: AccountScope, agentId: string, autonomy: Autonomy, deadlineAt?: number): Promise<void>;
	askRevise(scope: AccountScope, agentId: string, deadlineAt?: number): Promise<void>;
}

export function squads(
	context: { provide(name: string, service: SquadCommands): unknown },
	config: { repositories: () => Repositories },
): void {
	function writes(): SquadWrites {
		return config.repositories().squads as unknown as SquadWrites;
	}
	context.provide("workspaceSquads", {
		switchAgent,
		commitAgentOn,
		setAgentOn: (scope, agentId, on, deadlineAt) => writes().setAgentOn(scope, agentId, on, deadlineAt),
		setSkillOn: (scope, agentId, skillId, on, deadlineAt) =>
			writes().setSkillOn(scope, agentId, skillId, on, deadlineAt),
		setAutonomy: (scope, agentId, autonomy, deadlineAt) => writes().setAutonomy(scope, agentId, autonomy, deadlineAt),
		askRevise: (scope, agentId, deadlineAt) => writes().askRevise(scope, agentId, deadlineAt),
	});
}
