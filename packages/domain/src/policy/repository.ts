import type { AccountScope } from "../scope.ts";
import type { Approval, Inbox, MissionProposal, Rule } from "./types.ts";

export interface RuleDraft {
	readonly when: string;
	readonly agent: string;
	readonly action: string;
	readonly approval: string;
}

export interface PolicyRepository {
	listRules(scope: AccountScope): Promise<readonly Rule[]>;
	listApprovals(scope: AccountScope): Promise<readonly Approval[]>;
	listMissionProposals(scope: AccountScope): Promise<readonly MissionProposal[]>;
	inbox(scope: AccountScope): Promise<Inbox>;
	decide(scope: AccountScope, id: string, ok: boolean): Promise<void>;
	decideMission(scope: AccountScope, id: string, ok: boolean): Promise<void>;
	setRuleOn(scope: AccountScope, id: string, on: boolean): Promise<void>;
	addRule(scope: AccountScope, draft: RuleDraft): Promise<void>;
	setLimit(scope: AccountScope, key: string, value: number): Promise<void>;
}
