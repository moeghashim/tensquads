import type { Account, AccountScope, AccountStatus, PlanName } from "@tensquads/domain";
import { requireScope } from "@tensquads/domain";
import { and, asc, count, eq } from "drizzle-orm";

import { listMessages } from "./commands/conversation.ts";
import type { AppDatabase } from "./postgres.ts";
import { accounts, agents, approvals, masters, missionProposals, squads, subscriptions } from "./schema.ts";

export const FRAME_QUERY_COUNT = 6;

export interface FrameAgent {
	readonly id: string;
	readonly name: string;
	readonly tint: string;
	readonly on: boolean;
}

export interface WorkspaceFrame {
	readonly accountName: string;
	readonly owner: string;
	readonly masterName: string;
	readonly squadCount: number;
	readonly agents: readonly FrameAgent[];
	readonly approvalCount: number;
	readonly messages: Awaited<ReturnType<typeof listMessages>>;
}

export async function accountForClerkUser(db: AppDatabase, clerkUserId: string): Promise<Account | null> {
	const id = clerkUserId.trim();
	if (id.length === 0) {
		return null;
	}
	const rows = await db.select().from(accounts).where(eq(accounts.clerkUserId, id));
	const row = rows[0];
	if (!row) {
		return null;
	}
	const subscriptionRows = await db.select().from(subscriptions).where(eq(subscriptions.accountId, row.id));
	const subscription = subscriptionRows[0];
	if (!subscription) {
		throw new Error(`Account ${row.id} has no subscription.`);
	}
	const squadRows = await db.select().from(squads).where(eq(squads.accountId, row.id)).orderBy(asc(squads.sortOrder));
	return {
		id: row.id,
		name: row.name,
		owner: row.owner,
		email: row.email,
		plan: asPlan(subscription.plan),
		tint: row.tint,
		squads: squadRows.map((squad) => squad.name),
		agents: row.agents,
		online: row.online,
		tasks: row.tasks,
		lastActive: row.lastActive,
		status: asStatus(subscription.status),
		createdWeek: row.createdWeek,
		started: subscription.started,
		mrr: subscription.mrr,
		ltv: subscription.ltv,
		mission: row.mission,
	};
}

export async function readWorkspaceFrame(db: AppDatabase, scope: AccountScope): Promise<WorkspaceFrame> {
	const checked = requireScope(scope);
	if (checked.mode !== "account") {
		throw new Error("The workspace frame needs an account.");
	}
	const accountRows = await db.select().from(accounts).where(eq(accounts.id, checked.accountId));
	const account = accountRows[0];
	if (!account) {
		throw new Error("The account is missing.");
	}
	const masterRows = await db.select().from(masters).where(eq(masters.accountId, checked.accountId));
	const agentRows = await db
		.select({ id: agents.id, name: agents.name, tint: agents.tint, on: agents.isOn })
		.from(agents)
		.where(eq(agents.accountId, checked.accountId))
		.orderBy(asc(agents.sortOrder));
	const pending = await db
		.select({ total: count() })
		.from(approvals)
		.where(and(eq(approvals.accountId, checked.accountId), eq(approvals.status, "Pending")));
	const proposed = await db
		.select({ total: count() })
		.from(missionProposals)
		.where(and(eq(missionProposals.accountId, checked.accountId), eq(missionProposals.status, "Proposed")));
	const thread = await listMessages(db, checked.accountId);
	return {
		accountName: account.name,
		owner: account.owner,
		masterName: masterRows[0]?.name ?? "Master",
		squadCount: account.agents,
		agents: agentRows,
		approvalCount: asCount(pending[0]?.total) + asCount(proposed[0]?.total),
		messages: thread,
	};
}

function asCount(value: unknown): number {
	const number = Number(value ?? 0);
	return Number.isFinite(number) ? number : 0;
}

function asPlan(value: string): PlanName {
	if (value === "Starter" || value === "Growth" || value === "Scale") {
		return value;
	}
	throw new Error("Unknown plan.");
}

function asStatus(value: string): AccountStatus {
	if (value === "Active" || value === "Trial" || value === "Paused") {
		return value;
	}
	throw new Error("Unknown status.");
}
