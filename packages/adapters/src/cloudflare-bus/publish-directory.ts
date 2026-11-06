import { neonConfig, Pool } from "@neondatabase/serverless";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";

import type { AppDatabase } from "../neon/postgres.ts";
import { accounts, agents, mandates } from "../neon/schema.ts";

const WEBSITE_ROLE = "Website builder";
const PUBLISH_SKILL = "website.publish";

export interface PublishMandate {
	readonly approvalId: string;
	readonly ruleId: string;
	readonly ruleWhen: string;
	readonly ruleAction: string;
	readonly ruleApproval: string;
	readonly limitValue: number;
	readonly policyVersion: string;
	readonly saidYes: string;
	readonly at: string;
	readonly subject: string;
}

export interface StoredPublish {
	readonly slug: string;
	readonly mandate: PublishMandate;
}

export interface PublishDirectory {
	isWebsiteAgent(accountId: string, agentId: string): Promise<boolean>;
	storedPublish(accountId: string, taskId: string, slug: string, nowMs: number): Promise<StoredPublish | null>;
}

interface MandateRow {
	readonly approvalId: string;
	readonly ruleId: string;
	readonly ruleWhen: string;
	readonly ruleAction: string;
	readonly ruleApproval: string;
	readonly limitValue: number;
	readonly policyVersion: string;
	readonly saidYes: string;
	readonly saidAt: Date | string;
	readonly subject: string | null;
	readonly slug: string | null;
	readonly expiresAt: Date | string | null;
	readonly clerkUserId: string | null;
}

export function directoryFromDatabase(db: AppDatabase): PublishDirectory {
	return {
		isWebsiteAgent: (accountId, agentId) => websiteAgent(db, accountId, agentId),
		storedPublish: (accountId, taskId, slug, nowMs) => readStoredPublish(db, accountId, taskId, slug, nowMs),
	};
}

export function connectPublishDirectory(connectionString: string): PublishDirectory {
	return {
		isWebsiteAgent: (accountId, agentId) =>
			withPublishDatabase(connectionString, (db) => websiteAgent(db, accountId, agentId)),
		storedPublish: (accountId, taskId, slug, nowMs) =>
			withPublishDatabase(connectionString, (db) => readStoredPublish(db, accountId, taskId, slug, nowMs)),
	};
}

async function websiteAgent(db: AppDatabase, accountId: string, agentId: string): Promise<boolean> {
	const rows = await db
		.select({ role: agents.role })
		.from(agents)
		.where(and(eq(agents.accountId, accountId), eq(agents.id, agentId)));
	return rows[0]?.role === WEBSITE_ROLE;
}

async function readStoredPublish(
	db: AppDatabase,
	accountId: string,
	taskId: string,
	slug: string,
	nowMs: number,
): Promise<StoredPublish | null> {
	const row = await newestMandate(db, accountId, taskId);
	if (!row || !ownerSaidYes(row.saidYes, row.clerkUserId)) return null;
	if (await isAgentId(db, accountId, row.saidYes)) return null;
	if (!stillOpen(row.expiresAt, nowMs)) return null;
	const storedSlug = row.slug;
	if (storedSlug !== slug || storedSlug !== accountId) return null;
	const mandate = mandateOf(row);
	if (!mandate) return null;
	return { slug: storedSlug, mandate };
}

async function newestMandate(db: AppDatabase, accountId: string, taskId: string): Promise<MandateRow | null> {
	const rows = await db
		.select({
			approvalId: mandates.approvalId,
			ruleId: mandates.ruleId,
			ruleWhen: mandates.ruleWhen,
			ruleAction: mandates.ruleAction,
			ruleApproval: mandates.ruleApproval,
			limitValue: mandates.limitValue,
			policyVersion: mandates.policyVersion,
			saidYes: mandates.saidYes,
			saidAt: mandates.saidAt,
			subject: mandates.subject,
			slug: mandates.slug,
			expiresAt: mandates.expiresAt,
			clerkUserId: accounts.clerkUserId,
		})
		.from(mandates)
		.innerJoin(accounts, eq(accounts.id, mandates.accountId))
		.where(and(eq(mandates.accountId, accountId), eq(mandates.taskId, taskId), eq(mandates.skill, PUBLISH_SKILL)))
		.orderBy(desc(mandates.saidAt))
		.limit(1);
	return rows[0] ?? null;
}

async function isAgentId(db: AppDatabase, accountId: string, saidYes: string): Promise<boolean> {
	const rows = await db
		.select({ id: agents.id })
		.from(agents)
		.where(and(eq(agents.accountId, accountId), eq(agents.id, saidYes)))
		.limit(1);
	return rows.length > 0;
}

function ownerSaidYes(saidYes: string, clerkUserId: string | null): boolean {
	return typeof clerkUserId === "string" && clerkUserId.length > 0 && saidYes === clerkUserId;
}

// The caller supplies now. A grant at that time is already over.
function stillOpen(expiresAt: Date | string | null, nowMs: number): boolean {
	if (expiresAt === null) return false;
	const time = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
	return Number.isFinite(time) && time > nowMs;
}

function mandateOf(row: MandateRow): PublishMandate | null {
	if (typeof row.subject !== "string") return null;
	const at = clockText(row.saidAt);
	if (!at) return null;
	return {
		approvalId: row.approvalId,
		ruleId: row.ruleId,
		ruleWhen: row.ruleWhen,
		ruleAction: row.ruleAction,
		ruleApproval: row.ruleApproval,
		limitValue: row.limitValue,
		policyVersion: row.policyVersion,
		saidYes: row.saidYes,
		at,
		subject: row.subject,
	};
}

function clockText(value: Date | string): string | null {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString();
}

function sockets(): void {
	const socket = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
	if (socket) neonConfig.webSocketConstructor = socket;
}

async function withPublishDatabase<T>(connectionString: string, run: (db: AppDatabase) => Promise<T>): Promise<T> {
	sockets();
	const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 2_000 });
	try {
		const db = drizzle(pool, { schema: { accounts, agents, mandates } }) as unknown as AppDatabase;
		return await run(db);
	} finally {
		await pool.end();
	}
}
