export interface OverviewTileView {
	readonly label: string;
	readonly value: string;
	readonly delta: string;
	readonly deltaColor: string;
}

export interface OverviewBarView {
	readonly h: number;
	readonly fill: string;
	readonly label: string;
	readonly title: string;
}

export interface OverviewProposalView {
	readonly id: string;
	readonly agentId: string;
	readonly agentName: string;
	readonly tint: string;
	readonly title: string;
	readonly mission: string;
	readonly chips: readonly string[];
	readonly proposed: boolean;
	readonly revising: boolean;
}

export interface OverviewApprovalView {
	readonly id: string;
	readonly agentId: string;
	readonly agentName: string;
	readonly tint: string;
	readonly amount: string;
	readonly title: string;
	readonly detail: string;
}

export interface OverviewAgentView {
	readonly id: string;
	readonly name: string;
	readonly role: string;
	readonly tint: string;
	readonly on: boolean;
	readonly last: string;
	readonly tasks: number;
	readonly success: string;
	readonly saved: string;
	readonly mission: string;
	readonly contribution: number;
}

export interface OverviewData {
	readonly accountId: string;
	readonly greeting: string;
	readonly mission: string;
	readonly online: string;
	readonly tiles: readonly OverviewTileView[];
	readonly bars: readonly OverviewBarView[];
	readonly count: number;
	readonly empty: boolean;
	readonly emptyText: string;
	readonly proposals: readonly OverviewProposalView[];
	readonly approvals: readonly OverviewApprovalView[];
	readonly agents: readonly OverviewAgentView[];
	readonly masterName: string;
}
