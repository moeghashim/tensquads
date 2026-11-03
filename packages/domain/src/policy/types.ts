export interface Rule {
	readonly id: string;
	readonly when: string;
	readonly agent: string;
	readonly action: string;
	readonly approval: string;
	readonly on: boolean;
}

export interface Limit {
	readonly id: string;
	readonly key: string;
	readonly label: string;
	readonly value: number;
}

// The row a limit write returns. The screen replaces this key in the snapshot.
export interface StoredLimit {
	readonly key: string;
	readonly value: number;
}

// One browser tab, its rising write number, and earlier tab ids this write retires.
// The value is not a limit or a rule. A missing list retires nothing.
export interface WriteFence {
	readonly tab: string;
	readonly seq: number;
	readonly retires?: readonly string[];
}

// superseded means this tab is retired, or this tab already stored an equal or higher sequence.
export interface Fenced<T> {
	readonly status: "written" | "superseded";
	readonly row: T;
}

export type ApprovalStatus = "Pending" | "Approved" | "Declined";

export interface Approval {
	readonly id: string;
	readonly agent: string;
	readonly title: string;
	readonly detail: string;
	readonly amount: string;
	readonly status: ApprovalStatus;
}

// A Mandate is made when a person says yes.
// A Pending or Declined Approval has none. An Approved Approval has exactly one.
// A Mandate never changes after it is made.
export interface Mandate {
	readonly approvalId: string;
	readonly ruleId: string;
	readonly ruleWhen: string;
	readonly ruleAction: string;
	readonly ruleApproval: string;
	readonly limitValue: number;
	readonly policyVersion: string;
	readonly saidYes: string;
	readonly at: Date;
}

export type MissionProposalStatus = "Proposed" | "Revising" | "Approved";

export interface MissionProposal {
	readonly id: string;
	readonly agent: string;
	readonly mission: string;
	readonly targets: readonly (readonly [string, string])[];
	readonly status: MissionProposalStatus;
}

export interface Inbox {
	readonly approvals: readonly Approval[];
	readonly proposals: readonly MissionProposal[];
	readonly count: number;
	readonly empty: boolean;
	readonly emptyText: string;
}
