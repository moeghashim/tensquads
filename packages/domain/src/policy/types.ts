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

export type ApprovalStatus = "Pending" | "Approved" | "Declined";

export interface Approval {
	readonly id: string;
	readonly agent: string;
	readonly title: string;
	readonly detail: string;
	readonly amount: string;
	readonly status: ApprovalStatus;
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
