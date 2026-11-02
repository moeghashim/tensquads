import type { AccountScope } from "../scope.ts";
import type { Agent, Autonomy, Master, Squad } from "./types.ts";

export interface SquadsRepository {
	listSquads(scope: AccountScope): Promise<readonly Squad[]>;
	listAgents(scope: AccountScope): Promise<readonly Agent[]>;
	master(scope: AccountScope): Promise<Master | null>;
	tasksDone(scope: AccountScope): Promise<number>;
	setAgentOn(scope: AccountScope, agentId: string, on: boolean): Promise<void>;
	setSkillOn(scope: AccountScope, agentId: string, skillId: string, on: boolean): Promise<void>;
	setAutonomy(scope: AccountScope, agentId: string, autonomy: Autonomy): Promise<void>;
	askRevise(scope: AccountScope, agentId: string): Promise<void>;
}
