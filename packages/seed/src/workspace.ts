import type { WorkspaceSnapshot } from "@tensquads/adapters";
import type { Plan, PlanName } from "@tensquads/domain";

import { design } from "./design-file.ts";

const DEMO = "demo";

// mrr, ltv, plan, status, and started are copied onto the account object here.
// saveWorkspace stores them once, on the subscription row.
export function workspaceFromDesign(): WorkspaceSnapshot {
	const prices = design.planPrice;
	const plans: Plan[] = (["Starter", "Growth", "Scale"] as const).map((name) => ({
		id: name,
		name,
		monthly: prices[name] ?? 0,
	}));
	return {
		plans,
		images: design.seed.images,
		accounts: design.seed.accounts.map((account) => ({
			account: {
				...account,
				mission: design.companyMissions[account.id] ?? "[MISSION NOT SET]",
				plan: account.plan as PlanName,
			},
			...(account.id === DEMO ? demoData() : emptyData()),
			masterName: "Master",
		})),
	};
}

export function demoData() {
	return {
		agents: design.seed.agents,
		events: design.seed.bus,
		store: design.seed.store,
		rules: design.seed.rules,
		approvals: design.seed.approvals.map((item) => ({ ...item, status: "Pending" as const })),
		proposals: design.seed.missionProposals,
		revenue: design.revenue.map((day) => ({ day: day.day, amount: day.amount })),
		tiles: design.tiles,
		messages: design.seed.chat,
	};
}

function emptyData() {
	return {
		agents: [],
		events: [],
		store: {},
		rules: [],
		approvals: [],
		proposals: [],
		revenue: [],
		tiles: null,
		messages: [],
	};
}
