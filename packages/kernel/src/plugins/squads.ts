import { machineAction } from "../../../domain/src/squads/agent-commands.ts";

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
}

export function squads(context: { provide(name: string, service: SquadCommands): unknown }): void {
	context.provide("workspaceSquads", {
		switchAgent,
		commitAgentOn,
	});
}
