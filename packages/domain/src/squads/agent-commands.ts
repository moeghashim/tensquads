import type { AccountScope } from "../scope.ts";
import type { Autonomy } from "./types.ts";

export function machineAction(on: boolean): "start" | "stop" {
	return on ? "start" : "stop";
}

export function proposalId(agentId: string, now: number): string {
	return `mp-${agentId}-${now}`;
}

export type SetAgentOnCommand = (scope: AccountScope, agentId: string, on: boolean) => Promise<void>;

export type SetSkillOnCommand = (scope: AccountScope, agentId: string, skillId: string, on: boolean) => Promise<void>;

export type SetAutonomyCommand = (scope: AccountScope, agentId: string, autonomy: Autonomy) => Promise<void>;

export type AskReviseCommand = (scope: AccountScope, agentId: string) => Promise<void>;
