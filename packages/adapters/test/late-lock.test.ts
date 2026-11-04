import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { createRepositories, schema } from "@tensquads/adapters";
import { Kernel } from "@tensquads/kernel";
import { eq } from "drizzle-orm";

import { replaceDemoAccount } from "../../seed/src/demo-account.ts";
import { openPostgres } from "../src/neon/postgres.ts";
import { PENDING_TASK_WINDOW_MS } from "../src/pending-window.ts";

const ads = "How did ads do this week?";
const reply = "Ad spend this week is $262 at a 3.4 return. The best ad set is Prints, lookalike.";
const connection = process.env.TEST_DATABASE_URL ?? "";
const fenceLockClass = 1952804468;

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function isLockWait(error: unknown, depth = 0): boolean {
	if (!error || typeof error !== "object" || depth > 5) return false;
	const record = error as { code?: unknown; cause?: unknown };
	if (record.code === "55P03" || record.code === "57014") return true;
	return isLockWait(record.cause, depth + 1);
}

function databaseName(value: string): string {
	return new URL(value).pathname.replace(/^\//, "").split("?")[0] ?? "";
}

function refuseProduction(): void {
	const neon = process.env.NEON_POSTGRES_CONNECTION_STRING;
	if (neon && connection === neon) throw new Error("refusing the Neon connection");
	if (databaseName(connection) === "neondb") throw new Error("refusing the production database");
}

async function retryLockWait<T>(run: () => Promise<T>): Promise<T> {
	const deadline = Date.now() + 90_000;
	for (;;) {
		try {
			return await run();
		} catch (error) {
			if (!isLockWait(error) || Date.now() >= deadline) throw error;
			await delay(250);
		}
	}
}

async function holdLock(client: PoolClient, accountId: string): Promise<void> {
	const deadline = Date.now() + 90_000;
	for (;;) {
		const acquired = await client.query<{ pg_try_advisory_lock: boolean }>(
			"SELECT pg_try_advisory_lock($1, hashtext($2))",
			[fenceLockClass, accountId],
		);
		if (acquired.rows[0]?.pg_try_advisory_lock) return;
		if (Date.now() >= deadline) throw new Error("the account fence lock stayed busy");
		await delay(250);
	}
}

async function releaseLock(client: PoolClient, accountId: string): Promise<void> {
	await client.query("SELECT pg_advisory_unlock($1, hashtext($2))", [fenceLockClass, accountId]);
}

type Begin = { kind: string; taskId?: string; messages?: readonly { text: string }[] };

async function abandonedBegin(kernel: Kernel, scope: { accountId: string; mode: "account" }): Promise<Begin> {
	const [outcome] = await Promise.all([
		Promise.race([
			kernel.beginSend(scope, ads).then(
				(value) => value,
				() => ({ kind: "failed" }),
			),
			delay(PENDING_TASK_WINDOW_MS + 1_000).then(() => ({ kind: "pending" })),
		]),
		delay(PENDING_TASK_WINDOW_MS + 1_000),
	]);
	return outcome;
}

async function replyAfter(kernel: Kernel, scope: { accountId: string; mode: "account" }) {
	const deadline = Date.now() + 90_000;
	for (;;) {
		try {
			if (await replyPair(kernel, scope)) return;
		} catch (error) {
			if (!isLockWait(error)) throw error;
		}
		assert.ok(Date.now() < deadline, "the next send did not reply within 90 seconds");
		await delay(250);
	}
}

async function replyPair(kernel: Kernel, scope: { accountId: string; mode: "account" }): Promise<boolean> {
	const started = await kernel.beginSend(scope, ads);
	if (started.kind !== "working") return false;
	const finished = await kernel.finishSend(scope, started.taskId);
	if (finished.kind !== "replied") return false;
	assert.ok(finished.messages.some((message) => message.text === reply));
	return true;
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
	await db.delete(schema.missionProposals).where(eq(schema.missionProposals.accountId, accountId));
	await db.delete(schema.busEvents).where(eq(schema.busEvents.accountId, accountId));
	await db.delete(schema.stateEntries).where(eq(schema.stateEntries.accountId, accountId));
	await db.delete(schema.dailyRevenue).where(eq(schema.dailyRevenue.accountId, accountId));
	await db.delete(schema.overviewTiles).where(eq(schema.overviewTiles.accountId, accountId));
	await db.delete(schema.subscriptions).where(eq(schema.subscriptions.accountId, accountId));
	await db.delete(schema.busCursors).where(eq(schema.busCursors.accountId, accountId));
	await db.delete(schema.accounts).where(eq(schema.accounts.id, accountId));
}

test("a lock held past the window does not block the next send", {
	timeout: 180_000,
	skip: connection.length === 0,
}, async () => {
	refuseProduction();
	const suffix = randomBytes(4).toString("hex");
	const accountId = `late-${suffix}`;
	const opened = openPostgres(connection);
	await opened.migrate();
	const holder = new Pool({ connectionString: connection, max: 1 });
	const client = await holder.connect();
	let locked = false;
	try {
		await retryLockWait(() => replaceDemoAccount(opened.db, accountId, `clerk-${suffix}`));
		const scope = { accountId, mode: "account" as const };
		const kernel = new Kernel(createRepositories(opened.db));
		await holdLock(client, accountId);
		locked = true;
		const late = await abandonedBegin(kernel, scope);
		assert.notEqual(late.kind, "working");
		assert.notEqual(late.kind, "pending");
		await releaseLock(client, accountId);
		locked = false;
		await replyAfter(kernel, scope);
	} finally {
		if (locked) await releaseLock(client, accountId).catch(() => undefined);
		client.release();
		await holder.end();
		await removeAccount(opened.db, accountId);
		await opened.close();
	}
});
