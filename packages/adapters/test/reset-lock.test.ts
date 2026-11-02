import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { schema } from "@tensquads/adapters";
import { eq } from "drizzle-orm";

import { replaceDemoAccount } from "../../seed/src/demo-account.ts";
import { openPostgres } from "../src/neon/postgres.ts";
import { PENDING_TASK_WINDOW_MS } from "../src/pending-window.ts";

const connection = process.env.TEST_DATABASE_URL ?? "";
const lockKey = "SELECT pg_try_advisory_lock(1952804467, 1)";
const unlockKey = "SELECT pg_advisory_unlock(1952804467, 1)";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function holdLongerThanSendTimeout(): number {
	return Math.floor((PENDING_TASK_WINDOW_MS - 1) / 3) + 2_000;
}

function databaseName(value: string): string {
	const name = new URL(value).pathname.replace(/^\//, "").split("?")[0];
	return name ?? "";
}

function refuseProduction(): void {
	const neon = process.env.NEON_POSTGRES_CONNECTION_STRING;
	if (neon !== undefined && connection === neon) {
		throw new Error("refusing the Neon connection");
	}
	if (databaseName(connection) === "neondb") {
		throw new Error("refusing the production database");
	}
}

function isObject(error: unknown): error is object {
	return Boolean(error) && typeof error === "object";
}

function errorRecord(error: unknown, depth: number): { code?: unknown; cause?: unknown } | undefined {
	if (depth > 5 || !isObject(error)) {
		return undefined;
	}
	return error as { code?: unknown; cause?: unknown };
}

function readCode(error: unknown, depth: number): string {
	const record = errorRecord(error, depth);
	if (!record) {
		return "";
	}
	if (typeof record.code === "string") {
		return record.code;
	}
	return readCode(record.cause, depth + 1);
}

function codeOf(error: unknown): string {
	const code = readCode(error, 0);
	if (code.length > 0) {
		return code;
	}
	return "unknown";
}

async function finishReset(done: Promise<void>): Promise<void> {
	try {
		await done;
	} catch (error) {
		throw new Error(`reset failed with ${codeOf(error)}`);
	}
}

function watch(run: Promise<void>): { settled: () => boolean; done: Promise<void> } {
	let finished = false;
	const done = run.then(
		(value) => {
			finished = true;
			return value;
		},
		(error: unknown) => {
			finished = true;
			throw error;
		},
	);
	void done.catch(() => undefined);
	return { settled: () => finished, done };
}

function lockHeld(rows: { pg_try_advisory_lock: boolean }[]): boolean {
	return rows[0]?.pg_try_advisory_lock === true;
}

function assertStillWaiting(deadline: number): void {
	if (Date.now() >= deadline) {
		throw new Error("the workspace lock stayed busy");
	}
}

async function holdLock(client: PoolClient): Promise<void> {
	const deadline = Date.now() + 120_000;
	for (;;) {
		const acquired = await client.query<{ pg_try_advisory_lock: boolean }>(lockKey);
		if (lockHeld(acquired.rows)) {
			return;
		}
		assertStillWaiting(deadline);
		await delay(250);
	}
}

async function release(client: PoolClient, locked: boolean): Promise<void> {
	if (!locked) {
		return;
	}
	await client.query(unlockKey).catch(() => undefined);
}

async function removeAccount(db: ReturnType<typeof openPostgres>["db"], accountId: string) {
	await db.delete(schema.messages).where(eq(schema.messages.accountId, accountId));
	await db.delete(schema.threads).where(eq(schema.threads.accountId, accountId));
	await db.delete(schema.skills).where(eq(schema.skills.accountId, accountId));
	await db.delete(schema.machines).where(eq(schema.machines.accountId, accountId));
	await db.delete(schema.agents).where(eq(schema.agents.accountId, accountId));
	await db.delete(schema.squads).where(eq(schema.squads.accountId, accountId));
	await db.delete(schema.masters).where(eq(schema.masters.accountId, accountId));
	await db.delete(schema.rules).where(eq(schema.rules.accountId, accountId));
	await db.delete(schema.approvals).where(eq(schema.approvals.accountId, accountId));
	await db.delete(schema.missionProposals).where(eq(schema.missionProposals.accountId, accountId));
	await db.delete(schema.busEvents).where(eq(schema.busEvents.accountId, accountId));
	await db.delete(schema.stateEntries).where(eq(schema.stateEntries.accountId, accountId));
	await db.delete(schema.dailyRevenue).where(eq(schema.dailyRevenue.accountId, accountId));
	await db.delete(schema.overviewTiles).where(eq(schema.overviewTiles.accountId, accountId));
	await db.delete(schema.subscriptions).where(eq(schema.subscriptions.accountId, accountId));
	await db.delete(schema.busCursors).where(eq(schema.busCursors.accountId, accountId));
	await db.delete(schema.accounts).where(eq(schema.accounts.id, accountId));
}

test("a reset waiting on the advisory lock longer than the send timeout succeeds", {
	timeout: 180_000,
	skip: connection.length === 0,
}, async () => {
	refuseProduction();
	const suffix = randomBytes(4).toString("hex");
	const accountId = `reset-${suffix}`;
	const opened = openPostgres(connection);
	const holder = new Pool({ connectionString: connection, max: 1 });
	const client = await holder.connect();
	let locked = false;
	try {
		await holdLock(client);
		locked = true;
		const pending = watch(replaceDemoAccount(opened.db, accountId, `clerk-${suffix}`));
		await delay(holdLongerThanSendTimeout());
		assert.equal(pending.settled(), false);
		await client.query(unlockKey);
		locked = false;
		await finishReset(pending.done);
		const rows = await opened.db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
		assert.equal(rows.length, 1);
	} finally {
		await release(client, locked);
		client.release();
		await holder.end();
		await removeAccount(opened.db, accountId);
		await opened.close();
	}
});
