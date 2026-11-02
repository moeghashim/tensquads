import type { OverviewTile } from "../platform/types.ts";
import type { Agent } from "../squads/types.ts";
import type { Approval, MissionProposal, Rule } from "./types.ts";

// Main.dc.html:453. The empty inbox uses this sentence.
export const EMPTY_INBOX = "Nothing waiting. Your squads are working inside their limits.";

// Main.dc.html:1429 counts the approval list plus proposals whose status is Proposed.
// Persisted rows stay. Pending is the visible approval. Approved and Declined are off the list.
// Revising stays on the list and does not add to the count. Main.dc.html:1182 and :1429.
export function inboxCount(approvals: readonly Approval[], proposals: readonly MissionProposal[]): number {
	const pending = approvals.filter((item) => item.status === "Pending").length;
	const proposed = proposals.filter((item) => item.status === "Proposed").length;
	return pending + proposed;
}

// Main.dc.html:1429 noApprovals is both lists empty after the design removes decided rows.
// A Revising proposal is still in the list, so the inbox is not empty.
export function inboxIsEmpty(approvals: readonly Approval[], proposals: readonly MissionProposal[]): boolean {
	const visibleApprovals = approvals.some((item) => item.status === "Pending");
	const visibleProposals = proposals.some((item) => item.status !== "Approved");
	return !visibleApprovals && !visibleProposals;
}

// Main.dc.html:1165-1170. Approve adds one task and sets last. Decline changes no agent.
export function decideApproval<A extends Pick<Agent, "tasks" | "last">>(
	agent: A,
	approval: Approval,
	ok: boolean,
): { readonly agent: A; readonly approval: Approval } {
	if (approval.status !== "Pending") {
		return { agent, approval };
	}
	if (!ok) {
		return { agent, approval: { ...approval, status: "Declined" } };
	}
	return {
		agent: { ...agent, tasks: agent.tasks + 1, last: `${approval.title} (approved)` },
		approval: { ...approval, status: "Approved" },
	};
}

// Main.dc.html:1175-1183. Approve sets the mission and adds no task. Decline sets Revising.
export function decideMission<A extends Pick<Agent, "mission" | "targets" | "contribution" | "tasks">>(
	agent: A,
	proposal: MissionProposal,
	ok: boolean,
): { readonly agent: A; readonly proposal: MissionProposal } {
	if (proposal.status !== "Proposed") {
		return { agent, proposal };
	}
	if (!ok) {
		return { agent, proposal: { ...proposal, status: "Revising" } };
	}
	return {
		agent: {
			...agent,
			mission: proposal.mission,
			targets: proposal.targets.map(([label, goal]) => [label, "—", goal] as const),
			contribution: 0,
		},
		proposal: { ...proposal, status: "Approved" },
	};
}

// Main.dc.html:1186-1190. An existing proposal for the agent blocks a new one.
// Approved is the removed state, so it does not block. The caller supplies the id.
export function askRevise<A extends Pick<Agent, "id" | "mission" | "targets">>(
	agent: A,
	proposals: readonly MissionProposal[],
	id: string,
): { readonly proposals: readonly MissionProposal[] } {
	const blocked = proposals.some((item) => item.agent === agent.id && item.status !== "Approved");
	if (blocked) {
		return { proposals };
	}
	const created: MissionProposal = {
		id,
		agent: agent.id,
		mission: agent.mission,
		targets: agent.targets.map(([label, , goal]) => [label, goal] as const),
		status: "Revising",
	};
	return { proposals: [...proposals, created] };
}

export const BLANK = "—";
export const TASKS_DONE_LABEL = "Tasks done by squads";
const emptyDelta = "\u00a0";
const tasksDelta = "This week";
const tasksColor = "#5d5d5d";
const previousFill = "#c9c9c9";
const currentFill = "#181818";
const barScale = 1500;
const weekLength = 7;

const limitKeys = {
	support: "policy.refund_auto_limit",
	marketing: "policy.daily_ad_cap",
	inventory: "policy.reorder_limit",
} as const;

export interface RevenueBar {
	readonly h: number;
	readonly fill: string;
	readonly label: string;
	readonly title: string;
}

export interface TileInput {
	readonly stored: readonly OverviewTile[] | null;
	readonly tasksDone: number;
	readonly revenue: readonly number[];
	readonly saved: readonly string[];
}

export function blankText(value: string): string {
	return value.trim().length === 0 ? BLANK : value;
}

export function greetingName(owner: string): string {
	const trimmed = owner.trim();
	if (trimmed.length === 0) return BLANK;
	const at = trimmed.indexOf("@");
	const source = at === -1 ? trimmed : trimmed.slice(0, at);
	const word = source.trim().split(/\s+/)[0] ?? "";
	return word.length === 0 ? BLANK : word;
}

export function greetingLine(owner: string): string {
	return `Good morning, ${greetingName(owner)}`;
}

export function onlineLine(online: number, total: number): string {
	return `${online} of ${total} squads online`;
}

export function revisingLine(masterName: string): string {
	return `${masterName} is writing a new proposal. The squad stays on "Mission pending".`;
}

export function proposalTitle(status: MissionProposal["status"]): string {
	return status === "Revising" ? "Revised mission on its way" : "Proposed mission";
}

export function chipText(label: string, goal: string): string {
	return `${label}: ${goal}`;
}

export function matchedRule(rules: readonly Rule[], agentId: string): Rule | null {
	for (const rule of rules) {
		if (rule.on && rule.agent === agentId && rule.approval !== "Auto") return rule;
	}
	return null;
}

export function limitKeyFor(rule: Pick<Rule, "agent">): string | null {
	if (rule.agent === "support") return limitKeys.support;
	if (rule.agent === "marketing") return limitKeys.marketing;
	if (rule.agent === "inventory") return limitKeys.inventory;
	return null;
}

export function policyVersion(rules: readonly Rule[]): string {
	const body = rules
		.map((rule) => [rule.id, rule.when, rule.agent, rule.action, rule.approval, rule.on ? "1" : "0"].join("\u001f"))
		.join("\u001e");
	let hash = 0x811c9dc5;
	for (let index = 0; index < body.length; index++) {
		hash ^= body.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return `policy-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function revenueBars(rows: readonly { readonly day: string; readonly amount: number }[]): readonly RevenueBar[] {
	return rows.map((row, index) => barFor(row, index));
}

export function assembleTiles(input: TileInput): readonly OverviewTile[] {
	const tasks = tasksTile(input.tasksDone);
	if (input.stored === null) return blankTiles(tasks);
	const stored = input.stored.filter((tile) => tile.label !== TASKS_DONE_LABEL);
	return [
		revenueTile(findTile(stored, "Revenue"), input.revenue),
		findTile(stored, "Orders"),
		findTile(stored, "Average order"),
		findTile(stored, "Profit margin"),
		tasks,
		hoursTile(findTile(stored, "Hours saved"), input.saved),
	];
}

function blankTiles(tasks: OverviewTile): readonly OverviewTile[] {
	return [
		blankTile("Revenue"),
		blankTile("Orders"),
		blankTile("Average order"),
		blankTile("Profit margin"),
		tasks,
		blankTile("Hours saved"),
	];
}

function tasksTile(tasksDone: number): OverviewTile {
	return { label: TASKS_DONE_LABEL, value: String(tasksDone), delta: tasksDelta, deltaColor: tasksColor };
}

function blankTile(label: string): OverviewTile {
	return { label, value: BLANK, delta: emptyDelta, deltaColor: tasksColor };
}

function findTile(stored: readonly OverviewTile[], label: string): OverviewTile {
	const tile = stored.find((tile) => tile.label === label);
	if (!tile) return blankTile(label);
	return {
		...tile,
		value: blankText(tile.value),
		delta: tile.delta.trim().length === 0 ? emptyDelta : tile.delta,
	};
}

function revenueTile(stored: OverviewTile, amounts: readonly number[]): OverviewTile {
	const total = lastSeven(amounts);
	if (total === null) return { ...stored, value: BLANK };
	return { ...stored, value: money(total) };
}

function hoursTile(stored: OverviewTile, saved: readonly string[]): OverviewTile {
	const hours = hoursSaved(saved);
	if (hours === null) return { ...stored, value: BLANK };
	return { ...stored, value: hours };
}

function lastSeven(amounts: readonly number[]): number | null {
	if (amounts.length === 0) return null;
	return amounts.slice(-weekLength).reduce((sum, amount) => sum + amount, 0);
}

function money(amount: number): string {
	return `$${amount.toLocaleString("en-US")}`;
}

function hoursSaved(saved: readonly string[]): string | null {
	if (saved.length === 0) return null;
	let tenths = 0;
	for (const value of saved) {
		const part = savedTenths(value.trim());
		if (part === null) return null;
		tenths += part;
	}
	const whole = Math.floor(tenths / 10);
	const fraction = tenths % 10;
	return fraction === 0 ? `${whole}h` : `${whole}.${fraction}h`;
}

function savedTenths(value: string): number | null {
	const match = /^(\d+)(?:\.(\d))?h$/.exec(value);
	if (!match) return null;
	return Number(match[1]) * 10 + (match[2] ? Number(match[2]) : 0);
}

function barFor(row: { readonly day: string; readonly amount: number }, index: number): RevenueBar {
	const parts = dayParts(row.day);
	const label = parts?.label ?? row.day;
	const month = parts?.month ?? "";
	const title = month.length === 0 ? `${label}: ${money(row.amount)}` : `${month} ${label}: ${money(row.amount)}`;
	return {
		h: Math.round((row.amount / barScale) * 100),
		fill: index < weekLength ? previousFill : currentFill,
		label,
		title,
	};
}

function dayParts(day: string): { readonly label: string; readonly month: string } | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
	const date = new Date(`${day}T00:00:00Z`);
	if (Number.isNaN(date.getTime())) return null;
	return {
		label: String(date.getUTCDate()),
		month: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date),
	};
}
