import type { AccountScope } from "../scope.ts";
import type { Approval, Inbox, Mandate, MissionProposal, Rule } from "./types.ts";

export interface MandateDraft {
	readonly approvalId: string;
	readonly ruleId: string;
	readonly limitValue: number;
	readonly policyVersion: string;
	readonly saidYes: string;
	readonly at: Date;
}

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
	addRule(scope: AccountScope, draft: RuleDraft): Promise<string | null>;
	setLimit(scope: AccountScope, key: string, value: number): Promise<void>;
	createMandate(scope: AccountScope, draft: MandateDraft): Promise<Mandate>;
	mandate(scope: AccountScope, approvalId: string): Promise<Mandate | null>;
}
