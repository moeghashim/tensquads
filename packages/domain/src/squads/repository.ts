import type { AccountScope } from "../scope.ts";
import type { Agent, Master, Squad } from "./types.ts";

export interface SquadsRepository {
	listSquads(scope: AccountScope): Promise<readonly Squad[]>;
	listAgents(scope: AccountScope): Promise<readonly Agent[]>;
	master(scope: AccountScope): Promise<Master | null>;
	tasksDone(scope: AccountScope): Promise<number>;
}
