import type { Fenced, WriteFence } from "../policy/types.ts";
import type { AccountScope } from "../scope.ts";
import type { Agent, Autonomy, Master, Squad, StoredAgentOn, StoredAutonomy, StoredSkillOn } from "./types.ts";

export interface SquadsRepository {
	listSquads(scope: AccountScope): Promise<readonly Squad[]>;
	listAgents(scope: AccountScope): Promise<readonly Agent[]>;
	master(scope: AccountScope): Promise<Master | null>;
	tasksDone(scope: AccountScope): Promise<number>;
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
	askRevise(scope: AccountScope, agentId: string): Promise<void>;
}
