import type { Account, AccountStatus, PlanName } from "./types.ts";

export const MISSION_MISSING = "[MISSION NOT SET]";
export const WEEK_LABELS = ["Sep 7", "Sep 14", "Sep 21", "Sep 28", "Oct 5", "Oct 12", "Oct 19", "Oct 26"] as const;

const planFill: Record<PlanName, string> = { Starter: "#c9c9c9", Growth: "#0169cc", Scale: "#181818" };
const planPrice: Record<PlanName, number> = { Starter: 49, Growth: 149, Scale: 399 };
const plans: readonly PlanName[] = ["Starter", "Growth", "Scale"];

export type AccountFilter = "all" | AccountStatus;

export interface AccountKpi {
	readonly label: string;
	readonly value: string;
	readonly delta: string;
	readonly deltaColor: string;
}

export interface AccountBar {
	readonly h: number;
	readonly fill: string;
	readonly label: string;
	readonly title: string;
}

export interface AccountPlanMix {
	readonly label: PlanName;
	readonly count: number;
	readonly agents: number;
	readonly pct: number;
	readonly fill: string;
}

export interface AccountFilterChip {
	readonly id: AccountFilter;
	readonly label: string;
	readonly on: boolean;
}

export interface AccountRowView {
	readonly id: string;
	readonly name: string;
	readonly owner: string;
	readonly email: string;
	readonly tint: string;
	readonly initials: string;
	readonly mission: string;
	readonly plan: PlanName;
	readonly planStyle: string;
	readonly status: AccountStatus;
	readonly statusStyle: string;
	readonly subscription: string;
	readonly subscriptionNote: string;
	readonly started: string;
	readonly ltvDisplay: string;
	readonly agents: number;
	readonly online: string;
	readonly onlineColor: string;
	readonly tasks: string;
	readonly lastActive: string;
}

export interface AccountAdminView {
	readonly agentsOnline: number;
	readonly kpis: readonly AccountKpi[];
	readonly bars: readonly AccountBar[];
	readonly plans: readonly AccountPlanMix[];
	readonly avgAgents: string;
	readonly query: string;
	readonly filters: readonly AccountFilterChip[];
	readonly shown: string;
	readonly empty: boolean;
	readonly rows: readonly AccountRowView[];
}

export function money(amount: number): string {
	return `$${amount.toLocaleString("en-US")}`;
}

export function companyInitials(name: string): string {
	return name
		.split(" ")
		.filter((word) => /^[A-Za-z]/.test(word))
		.slice(0, 2)
		.map((word) => word.charAt(0).toUpperCase())
		.join("");
}

export function missionText(mission: string): string {
	return mission || MISSION_MISSING;
}

export function weekCounts(accounts: readonly Account[]): number[] {
	const counts = [0, 0, 0, 0, 0, 0, 0, 0];
	for (const account of accounts) {
		if (account.createdWeek >= 0 && account.createdWeek <= 7) {
			counts[account.createdWeek] += 1;
		}
	}
	return counts;
}

function sum(list: readonly Account[], key: "agents" | "online" | "tasks" | "mrr" | "ltv"): number {
	return list.reduce((total, account) => total + account[key], 0);
}

function pill(background: string, color: string): string {
	return `height: 22px; padding: 0 8px; border-radius: 999px; background: ${background}; color: ${color}; font-size: 12px; font-weight: 500; display: inline-flex; align-items: center; flex: none; white-space: nowrap`;
}

function planStyle(plan: PlanName): string {
	if (plan === "Scale") return pill("#0d0d0d", "#fff");
	if (plan === "Growth") return pill("#0285ff14", "#004f99");
	return pill("rgba(13,13,13,.06)", "#414141");
}

function statusStyle(status: AccountStatus): string {
	if (status === "Active") return pill("#04b84c14", "#00692a");
	if (status === "Trial") return pill("#fb6a2214", "#923b0f");
	return pill("rgba(13,13,13,.06)", "#5d5d5d");
}

function chipStyle(on: boolean): string {
	const background = on ? "#181818" : "rgba(13,13,13,.06)";
	const color = on ? "#fff" : "#282828";
	return `height: 32px; padding: 0 12px; border: 0; border-radius: 999px; font-size: 13px; font-weight: 500; background: ${background}; color: ${color}`;
}

export function accountFilterStyle(on: boolean): string {
	return chipStyle(on);
}

function matches(account: Account, filter: AccountFilter, query: string): boolean {
	const text = `${account.name} ${account.owner} ${account.email}`.toLowerCase();
	const statusOk = filter === "all" || account.status === filter;
	return statusOk && (query.length === 0 || text.includes(query));
}

function rowView(account: Account): AccountRowView {
	const price = planPrice[account.plan];
	const subscription =
		account.status === "Trial" ? "Trial" : account.status === "Paused" ? "Paused" : `${money(account.mrr)} / mo`;
	const subscriptionNote =
		account.status === "Trial"
			? `${money(price)} / mo after`
			: account.status === "Paused"
				? `was ${money(price)} / mo`
				: "billed monthly";
	return {
		id: account.id,
		name: account.name,
		owner: account.owner,
		email: account.email,
		tint: account.tint,
		initials: companyInitials(account.name),
		mission: missionText(account.mission),
		plan: account.plan,
		planStyle: planStyle(account.plan),
		status: account.status,
		statusStyle: statusStyle(account.status),
		subscription,
		subscriptionNote,
		started: account.started,
		ltvDisplay: account.ltv > 0 ? money(account.ltv) : "—",
		agents: account.agents,
		online: `${account.online} / ${account.agents}`,
		onlineColor: account.online > 0 ? "#00692a" : "#8f8f8f",
		tasks: account.tasks.toLocaleString("en-US"),
		lastActive: account.lastActive,
	};
}

export function accountAdminView(accounts: readonly Account[], filter: AccountFilter, query: string): AccountAdminView {
	const q = query.trim().toLowerCase();
	const shown = accounts.filter((account) => matches(account, filter, q));
	const counts = weekCounts(accounts);
	const weekMax = Math.max(...counts) || 1;
	const totalAgents = sum(accounts, "agents");
	const mrrTotal = sum(accounts, "mrr");
	const ltvTotal = sum(accounts, "ltv");
	const online = sum(accounts, "online");
	const paying = accounts.filter((account) => account.ltv > 0).length;
	const filterRows = [
		["all", "All"],
		["Active", "Active"],
		["Trial", "Trial"],
		["Paused", "Paused"],
	] as const satisfies readonly (readonly [AccountFilter, string])[];
	const filters: AccountFilterChip[] = filterRows.map(([id, label]) => ({ id, label, on: filter === id }));
	return {
		agentsOnline: online,
		kpis: [
			{
				label: "Companies",
				value: String(accounts.length),
				delta: `+${counts[7] + counts[6]} in the last 2 weeks`,
				deltaColor: "#00692a",
			},
			{
				label: "Active companies",
				value: String(accounts.filter((account) => account.status === "Active").length),
				delta: `${accounts.filter((account) => account.status === "Trial").length} on trial · ${accounts.filter((account) => account.status === "Paused").length} paused`,
				deltaColor: "#5d5d5d",
			},
			{
				label: "Squads",
				value: String(totalAgents),
				delta: `${online} online right now`,
				deltaColor: "#00692a",
			},
			{
				label: "Tasks done, 7d",
				value: sum(accounts, "tasks").toLocaleString("en-US"),
				delta: "+9% vs last week",
				deltaColor: "#00692a",
			},
			{
				label: "Monthly recurring",
				value: money(mrrTotal),
				delta: `${accounts.filter((account) => account.mrr > 0).length} paying companies`,
				deltaColor: "#00692a",
			},
			{
				label: "All-time company value",
				value: money(ltvTotal),
				delta: `Avg ${money(Math.round(ltvTotal / Math.max(1, paying)))} per paying company`,
				deltaColor: "#5d5d5d",
			},
		],
		bars: counts.map((value, index) => ({
			h: Math.max(4, Math.round((value / weekMax) * 100)),
			fill: index === 7 ? "#181818" : "#c9c9c9",
			label: WEEK_LABELS[index] ?? "",
			title: `Week of ${WEEK_LABELS[index]}: ${value} ${value === 1 ? "company" : "companies"}`,
		})),
		plans: plans.map((plan) => {
			const list = accounts.filter((account) => account.plan === plan);
			return {
				label: plan,
				count: list.length,
				agents: sum(list, "agents"),
				pct: Math.round((list.length / accounts.length) * 100),
				fill: planFill[plan],
			};
		}),
		avgAgents: (totalAgents / accounts.length).toFixed(1),
		query,
		filters,
		shown: `${shown.length} of ${accounts.length}`,
		empty: shown.length === 0,
		rows: shown.map(rowView),
	};
}
