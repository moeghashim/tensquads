export type PlanName = "Starter" | "Growth" | "Scale";

export type AccountStatus = "Active" | "Trial" | "Paused";

export interface Plan {
	readonly id: PlanName;
	readonly name: PlanName;
	readonly monthly: number;
}

export interface Subscription {
	readonly accountId: string;
	readonly plan: PlanName;
	readonly status: AccountStatus;
	readonly mrr: number;
	readonly ltv: number;
	readonly started: string;
}

// The design shows these fields on the account. The repository joins the subscription
// onto this object. mrr, ltv, plan, status, and started are stored once, on the subscription.
export interface Account {
	readonly id: string;
	readonly name: string;
	readonly owner: string;
	readonly email: string;
	readonly plan: PlanName;
	readonly tint: string;
	readonly squads: readonly string[];
	readonly agents: number;
	readonly online: number;
	readonly tasks: number;
	readonly lastActive: string;
	readonly status: AccountStatus;
	readonly createdWeek: number;
	readonly started: string;
	readonly mrr: number;
	readonly ltv: number;
	readonly mission: string;
}

export interface DailyRevenue {
	readonly day: string;
	readonly amount: number;
}

export interface OverviewTile {
	readonly label: string;
	readonly value: string;
	readonly delta: string;
	readonly deltaColor: string;
}

export interface NewAgent {
	readonly id: string;
	readonly name: string;
	readonly role: string;
	readonly tint: string;
}

export interface WorkspaceDraft {
	readonly clerkUserId: string;
	readonly email: string;
	readonly name: string;
	readonly mission: string;
	readonly agents: readonly NewAgent[];
}

export interface WorkspaceCreated {
	readonly accountId: string;
	readonly created: boolean;
}

export interface PlatformTotals {
	readonly accounts: number;
	readonly agents: number;
	readonly squads: number;
	readonly mrr: number;
	readonly allTime: number;
	readonly tasksDone: number;
	readonly images: number;
	readonly openBugs: number;
	readonly featuresRequested: number;
}
