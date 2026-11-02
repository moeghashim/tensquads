import type { AccountScope } from "../scope.ts";
import type { Autonomy } from "./types.ts";

export type SetAgentOnCommand = (scope: AccountScope, agentId: string, on: boolean) => Promise<void>;

export type SetSkillOnCommand = (scope: AccountScope, agentId: string, skillId: string, on: boolean) => Promise<void>;

export type SetAutonomyCommand = (scope: AccountScope, agentId: string, autonomy: Autonomy) => Promise<void>;

export type AskReviseCommand = (scope: AccountScope, agentId: string) => Promise<void>;
