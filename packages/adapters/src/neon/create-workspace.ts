import { type AccountScope, requireScope, type WorkspaceCreated, type WorkspaceDraft } from "@tensquads/domain";
import { eq, max, sql } from "drizzle-orm";

import { seedNewAccountStateRows } from "../cloudflare-bus/neon-write.ts";
import { takeWriterLock } from "./lock.ts";
import type { AppDatabase } from "./postgres.ts";
import { accounts, agents, machines, masters, squads, subscriptions } from "./schema.ts";

const accountTint = "#e7efff";
const masterName = "Master";
const squadId = "main";
const defaultLimits = [
	["policy.refund_auto_limit", 50],
	["policy.daily_ad_cap", 200],
	["policy.reorder_limit", 500],
] as const;

function startedOn(date: Date): string {
	const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

// The scope account id is the id of a new row.
// A clerk user id that already has an account returns that account and writes nothing.
export async function createWorkspace(
	db: AppDatabase,
	scope: AccountScope,
	draft: WorkspaceDraft,
): Promise<WorkspaceCreated> {
	const checked = requireScope(scope);
	if (draft.agents.length === 0) {
		throw new Error("Pick at least one squad to start.");
	}
	try {
		return await insertWorkspace(db, checked.accountId, draft);
	} catch (error) {
		const again = await db
			.select({ id: accounts.id })
			.from(accounts)
			.where(eq(accounts.clerkUserId, draft.clerkUserId));
		const row = again[0];
		if (row) {
			return { accountId: row.id, created: false };
		}
		throw error;
	}
}

async function insertWorkspace(db: AppDatabase, accountId: string, draft: WorkspaceDraft): Promise<WorkspaceCreated> {
	return db.transaction(async (tx) => {
		// The shared global lock, then this Clerk user. A new account id would not
		// serialize two creates for the same user, and a read before the lock deadlocks a migration.
		await takeWriterLock((statement) => tx.execute(sql.raw(statement)), draft.clerkUserId);
		const existing = await tx
			.select({ id: accounts.id })
			.from(accounts)
			.where(eq(accounts.clerkUserId, draft.clerkUserId));
		const found = existing[0];
		if (found) {
			return { accountId: found.id, created: false };
		}
		const now = new Date();
		const highest = await tx.select({ value: max(accounts.sortOrder) }).from(accounts);
		const current = highest[0]?.value;
		const sortOrder = current === null || current === undefined ? 0 : current + 1;
		await tx.insert(accounts).values({
			id: accountId,
			accountId,
			name: draft.name,
			owner: draft.email,
			email: draft.email,
			clerkUserId: draft.clerkUserId,
			tint: accountTint,
			agents: draft.agents.length,
			online: draft.agents.length,
			tasks: 0,
			lastActive: "Just now",
			createdWeek: 7,
			mission: draft.mission,
			sortOrder,
		});
		await tx.insert(subscriptions).values({
			accountId,
			plan: "Starter",
			status: "Trial",
			mrr: 0,
			ltv: 0,
			started: startedOn(now),
			sortOrder: 0,
		});
		await tx.insert(squads).values({
			accountId,
			id: squadId,
			name: draft.name,
			sortOrder: 0,
		});
		await tx.insert(masters).values({
			accountId,
			name: masterName,
			sortOrder: 0,
		});
		await tx.insert(agents).values(
			draft.agents.map((agent, index) => ({
				accountId,
				id: agent.id,
				name: agent.name,
				role: agent.role,
				tint: agent.tint,
				isOn: true,
				autonomy: "Ask first",
				mission: "",
				contribution: 0,
				tasks: 0,
				success: "",
				saved: "",
				lastText: "",
				targets: [],
				kpis: [],
				sortOrder: index,
			})),
		);
		await tx.insert(machines).values(
			draft.agents.map((agent, index) => ({
				accountId,
				agentId: agent.id,
				host: "",
				region: "",
				size: "",
				cpu: "",
				uptime: "",
				egress: [],
				secrets: [],
				sortOrder: index,
			})),
		);
		await seedNewAccountStateRows(
			tx,
			defaultLimits.map(([key, value], index) => ({
				accountId,
				key,
				value: JSON.stringify(value),
				sortOrder: index,
			})),
		);
		return { accountId, created: true };
	});
}
