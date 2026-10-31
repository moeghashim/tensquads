import type {
	Account,
	Agent,
	AgentImage,
	Approval,
	BusEvent,
	DailyRevenue,
	Message,
	MissionProposal,
	OverviewTile,
	Plan,
	Rule,
} from "@tensquads/domain";

export interface AccountSnapshot {
	readonly account: Account;
	readonly agents: readonly Agent[];
	readonly events: readonly BusEvent[];
	readonly store: Readonly<Record<string, unknown>>;
	readonly rules: readonly Rule[];
	readonly approvals: readonly Approval[];
	readonly proposals: readonly MissionProposal[];
	readonly revenue: readonly DailyRevenue[];
	readonly tiles: readonly OverviewTile[] | null;
	readonly messages: readonly Message[];
	readonly masterName: string;
}

export interface WorkspaceSnapshot {
	readonly accounts: readonly AccountSnapshot[];
	readonly images: readonly AgentImage[];
	readonly plans: readonly Plan[];
}

export function squadId(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return slug.length > 0 ? slug : "squad";
}
