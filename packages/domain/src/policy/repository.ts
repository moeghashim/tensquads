import type { AccountScope } from "../scope.ts";
import type { Approval, Inbox, MissionProposal, Rule } from "./types.ts";

export interface PolicyRepository {
	listRules(scope: AccountScope): Promise<readonly Rule[]>;
	listApprovals(scope: AccountScope): Promise<readonly Approval[]>;
	listMissionProposals(scope: AccountScope): Promise<readonly MissionProposal[]>;
	inbox(scope: AccountScope): Promise<Inbox>;
}
