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
			agents: account.id === DEMO ? design.seed.agents : [],
			events: account.id === DEMO ? design.seed.bus : [],
			store: account.id === DEMO ? design.seed.store : {},
			rules: account.id === DEMO ? design.seed.rules : [],
			approvals:
				account.id === DEMO ? design.seed.approvals.map((item) => ({ ...item, status: "Pending" as const })) : [],
			proposals: account.id === DEMO ? design.seed.missionProposals : [],
			revenue: account.id === DEMO ? design.revenue.map((day) => ({ day: day.day, amount: day.amount })) : [],
			tiles: account.id === DEMO ? design.tiles : null,
			messages: account.id === DEMO ? design.seed.chat : [],
			masterName: "Master",
		})),
	};
}
