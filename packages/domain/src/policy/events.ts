export interface ApprovalDecided {
	readonly type: "approval.decided";
	readonly approvalId: string;
	readonly ok: boolean;
}

export interface MissionDecided {
	readonly type: "mission.decided";
	readonly proposalId: string;
	readonly ok: boolean;
}

export type PolicyEvent = ApprovalDecided | MissionDecided;
