import { createHash } from "node:crypto";
import type { GrantQuery, StoredGrant } from "@tensquads/domain/master";
import { and, desc, eq } from "drizzle-orm";

const GRANT_MS = 24 * 60 * 60 * 1000;

import { withNeon } from "../../cloudflare-bus/neon-write.ts";
import type { AppDatabase } from "../postgres.ts";
import { accounts, busEvents, mandates } from "../schema.ts";
import { mandateSkill, publishAsk } from "./master-ask.ts";

function sha256Hex(text: string): string {
	return createHash("sha256").update(text, "utf8").digest("hex");
}

function textField(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function exactText(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function hexField(value: unknown): string | null {
	const text = textField(value);
	return /^[0-9a-f]{64}$/.test(text) ? text : null;
}

export async function insertRunMandate(
	db: AppDatabase,
	accountId: string,
	approval: { readonly id: string; readonly title: string; readonly detail: string },
	actorId: string,
	at: Date,
): Promise<void> {
	const rows = await db
		.select({ payload: busEvents.payload })
		.from(busEvents)
		.where(and(eq(busEvents.accountId, accountId), eq(busEvents.id, approval.id)));
	const payload = rows[0]?.payload ?? {};
	const skill = textField(payload.skill) || mandateSkill(approval.title);
	const subject = hexField(payload.subject) ?? sha256Hex(approval.detail);
	const taskId = textField(payload.taskId);
	if (taskId.length === 0) throw new Error("The task id is missing.");
	const slug = skill === "website.publish" || approval.title === publishAsk ? exactText(payload.slug) : null;
	await db.insert(mandates).values({
		accountId,
		approvalId: approval.id,
		ruleId: "run",
		ruleWhen: approval.title,
		ruleAction: skill,
		ruleApproval: "Ask first",
		limitValue: 0,
		policyVersion: "run-1",
		saidYes: actorId,
		saidAt: at,
		taskId,
		skill,
		subject,
		slug,
		expiresAt: new Date(at.getTime() + GRANT_MS),
	});
}

export async function readAccountOwner(connectionString: string, accountId: string): Promise<string> {
	try {
		return await withNeon(connectionString, async (db) => {
			const rows = await db
				.select({ clerkUserId: accounts.clerkUserId })
				.from(accounts)
				.where(eq(accounts.id, accountId));
			return rows[0]?.clerkUserId ?? "";
		});
	} catch {
		return "";
	}
}

export async function readStoredGrant(connectionString: string, query: GrantQuery): Promise<StoredGrant | null> {
	try {
		return await withNeon(connectionString, async (db) => {
			const rows = await db
				.select()
				.from(mandates)
				.where(
					and(
						eq(mandates.accountId, query.accountId),
						eq(mandates.taskId, query.taskId),
						eq(mandates.skill, query.skill),
					),
				)
				.orderBy(desc(mandates.saidAt));
			const row = rows[0];
			if (!row?.taskId || !row.skill || !row.subject || !row.expiresAt) return null;
			return {
				accountId: row.accountId,
				taskId: row.taskId,
				skill: row.skill,
				subject: row.subject,
				slug: row.slug,
				saidYes: row.saidYes,
				saidAt: row.saidAt.toISOString(),
				expiresAt: row.expiresAt.toISOString(),
			};
		});
	} catch {
		return null;
	}
}
