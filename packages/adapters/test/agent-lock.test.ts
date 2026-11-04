import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { createRepositories, schema } from "@tensquads/adapters";
import { Kernel } from "@tensquads/kernel";
import { and, eq } from "drizzle-orm";

import { replaceDemoAccount } from "../../seed/src/demo-account.ts";
import { openPostgres } from "../src/neon/postgres.ts";
import { PENDING_TASK_WINDOW_MS } from "../src/pending-window.ts";

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

async function holdAccountLock(client: PoolClient, accountId: string): Promise<void> {
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

async function releaseAccountLock(client: PoolClient, accountId: string): Promise<void> {
	await client.query("SELECT pg_advisory_unlock($1, hashtext($2))", [fenceLockClass, accountId]);
}

async function waitForFenceWait(client: PoolClient): Promise<void> {
	const deadline = Date.now() + 10_000;
	for (;;) {
		const waiting = await client.query<{ n: number }>(
			"SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND classid = $1 AND NOT granted",
			[fenceLockClass],
		);
		if ((waiting.rows[0]?.n ?? 0) > 0) return;
		if (Date.now() >= deadline) throw new Error("the account write did not wait on its fence lock");
		await delay(50);
	}
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

async function agentOn(db: ReturnType<typeof openPostgres>["db"], accountId: string): Promise<boolean> {
	const rows = await db
		.select({ on: schema.agents.isOn })
		.from(schema.agents)
		.where(and(eq(schema.agents.accountId, accountId), eq(schema.agents.id, "support")));
	const row = rows[0];
	if (!row) throw new Error("support is missing");
	return row.on;
}

test("two accounts write at once and the second agent commits while the first is held", {
	timeout: 120_000,
	skip: connection.length === 0,
}, async () => {
	refuseProduction();
	const suffix = randomBytes(4).toString("hex");
	const accountA = `agent-lock-a-${suffix}`;
	const accountB = `agent-lock-b-${suffix}`;
	const openedA = openPostgres(connection);
	const openedB = openPostgres(connection);
	await openedA.migrate();
	const holder = new Pool({ connectionString: connection, max: 1 });
	const client = await holder.connect();
	let locked = false;
	try {
		await retryLockWait(() => replaceDemoAccount(openedA.db, accountA, `clerk-a-${suffix}`));
		await retryLockWait(() => replaceDemoAccount(openedB.db, accountB, `clerk-b-${suffix}`));
		const scopeA = { accountId: accountA, mode: "account" as const };
		const scopeB = { accountId: accountB, mode: "account" as const };
		const kernelA = new Kernel(createRepositories(openedA.db));
		const kernelB = new Kernel(createRepositories(openedB.db));
		assert.equal(await agentOn(openedA.db, accountA), true);
		assert.equal(await agentOn(openedB.db, accountB), true);
		await holdAccountLock(client, accountA);
		locked = true;
		let settledA = "pending";
		const deadline = Date.now() + PENDING_TASK_WINDOW_MS;
		const writeA = kernelA.setAgentOn(scopeA, "support", false, { tab: "account-a", seq: 1 }, deadline).then(
			() => {
				settledA = "committed";
			},
			() => {
				settledA = "rejected";
			},
		);
		await waitForFenceWait(client);
		const started = Date.now();
		const resultB = await kernelB.setAgentOn(
			scopeB,
			"support",
			false,
			{ tab: "account-b", seq: 1 },
			Date.now() + PENDING_TASK_WINDOW_MS,
		);
		const elapsed = Date.now() - started;
		assert.equal(resultB.status, "written");
		assert.equal(resultB.row.on, false);
		assert.ok(elapsed < 4_000, `account B waited ${elapsed}ms`);
		assert.equal(settledA, "pending");
		// Account A's pool has one connection, and that connection is waiting on the lock.
		assert.equal(await agentOn(openedB.db, accountB), false);
		assert.equal(await agentOn(openedB.db, accountA), true);
		await releaseAccountLock(client, accountA);
		locked = false;
		await writeA;
		assert.equal(settledA, "committed");
		assert.equal(await agentOn(openedA.db, accountA), false);
	} finally {
		if (locked) await releaseAccountLock(client, accountA).catch(() => undefined);
		client.release();
		await holder.end();
		await removeAccount(openedA.db, accountA);
		await removeAccount(openedA.db, accountB);
		await openedA.close();
		await openedB.close();
	}
});
