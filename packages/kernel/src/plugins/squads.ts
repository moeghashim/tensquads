import type {
	AccountScope,
	Autonomy,
	Fenced,
	StoredAgentOn,
	StoredAutonomy,
	StoredSkillOn,
	WriteFence,
} from "@tensquads/domain";

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
	setAgentOn(
		scope: AccountScope,
		agentId: string,
		on: boolean,
		fence: WriteFence,
		deadlineAt: number,
	): Promise<Fenced<StoredAgentOn>>;
	setSkillOn(
		scope: AccountScope,
		agentId: string,
		skillId: string,
		on: boolean,
		fence: WriteFence,
		deadlineAt: number,
	): Promise<Fenced<StoredSkillOn>>;
	setAutonomy(
		scope: AccountScope,
		agentId: string,
		autonomy: Autonomy,
		fence: WriteFence,
		deadlineAt: number,
	): Promise<Fenced<StoredAutonomy>>;
	askRevise(scope: AccountScope, agentId: string, deadlineAt: number): Promise<void>;
}

interface SquadWrites {
	setAgentOn(
		scope: AccountScope,
		agentId: string,
		on: boolean,
		fence: WriteFence,
		deadlineAt?: number,
	): Promise<Fenced<StoredAgentOn>>;
	setSkillOn(
		scope: AccountScope,
		agentId: string,
		skillId: string,
		on: boolean,
		fence: WriteFence,
		deadlineAt?: number,
	): Promise<Fenced<StoredSkillOn>>;
	setAutonomy(
		scope: AccountScope,
		agentId: string,
		autonomy: Autonomy,
		fence: WriteFence,
		deadlineAt?: number,
	): Promise<Fenced<StoredAutonomy>>;
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
		setAgentOn: (scope, agentId, on, fence, deadlineAt) => writes().setAgentOn(scope, agentId, on, fence, deadlineAt),
		setSkillOn: (scope, agentId, skillId, on, fence, deadlineAt) =>
			writes().setSkillOn(scope, agentId, skillId, on, fence, deadlineAt),
		setAutonomy: (scope, agentId, autonomy, fence, deadlineAt) =>
			writes().setAutonomy(scope, agentId, autonomy, fence, deadlineAt),
		askRevise: (scope, agentId, deadlineAt) => writes().askRevise(scope, agentId, deadlineAt),
	});
}
