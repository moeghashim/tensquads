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

const connection = process.env.TEST_DATABASE_URL ?? "";
const fenceLockClass = 1952804468;
const adCap = "policy.daily_ad_cap";

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

test("a late ad-cap write commits nothing after the deadline", {
	timeout: 120_000,
	skip: connection.length === 0,
}, async () => {
	refuseProduction();
	const suffix = randomBytes(4).toString("hex");
	const accountId = `rules-late-${suffix}`;
	const opened = openPostgres(connection);
	await opened.migrate();
	const holder = new Pool({ connectionString: connection, max: 1 });
	const client = await holder.connect();
	let locked = false;
	try {
		await retryLockWait(() => replaceDemoAccount(opened.db, accountId, `clerk-${suffix}`));
		const scope = { accountId, mode: "account" as const };
		const repositories = createRepositories(opened.db);
		const kernel = new Kernel(repositories);
		assert.equal((await repositories.bus.readStore(scope))[adCap], 200);
		await holdAccountLock(client, accountId);
		locked = true;
		let settled = "pending";
		const write = kernel.setLimit(scope, adCap, 240, { tab: "deadline", seq: 1 }).then(
			() => {
				settled = "committed";
			},
			() => {
				settled = "rejected";
			},
		);
		const raced = await Promise.race([
			write.then(() => settled),
			delay(PENDING_TASK_WINDOW_MS + 2_000).then(() => "waiting"),
		]);
		await releaseAccountLock(client, accountId);
		locked = false;
		if (raced === "waiting") await write;
		const store = await repositories.bus.readStore(scope);
		assert.equal(store[adCap], 200);
		assert.equal(settled, "rejected");
	} finally {
		if (locked) await releaseAccountLock(client, accountId).catch(() => undefined);
		client.release();
		await holder.end();
		await removeAccount(opened.db, accountId);
		await opened.close();
	}
});

test("two accounts write at once and neither waits on the other", {
	timeout: 120_000,
	skip: connection.length === 0,
}, async () => {
	refuseProduction();
	const suffix = randomBytes(4).toString("hex");
	const accountA = `rules-lock-a-${suffix}`;
	const accountB = `rules-lock-b-${suffix}`;
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
		await holdAccountLock(client, accountA);
		locked = true;
		let settledA = "pending";
		const writeA = kernelA.setLimit(scopeA, adCap, 240, { tab: "account-a", seq: 1 }).then(
			() => {
				settledA = "committed";
			},
			() => {
				settledA = "rejected";
			},
		);
		await waitForFenceWait(client);
		const started = Date.now();
		const resultB = await kernelB.setLimit(scopeB, adCap, 260, { tab: "account-b", seq: 1 });
		const elapsed = Date.now() - started;
		assert.equal(resultB.status, "written");
		assert.equal(resultB.row.value, 260);
		assert.ok(elapsed < 4_000, `account B waited ${elapsed}ms`);
		assert.equal(settledA, "pending");
		await releaseAccountLock(client, accountA);
		locked = false;
		await writeA;
		assert.equal(settledA, "committed");
		assert.equal((await createRepositories(openedA.db).bus.readStore(scopeA))[adCap], 240);
		assert.equal((await createRepositories(openedB.db).bus.readStore(scopeB))[adCap], 260);
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

test("a deadline that already passed commits no rule, switch, or limit", async () => {
	if (connection.length === 0) return;
	refuseProduction();
	const suffix = randomBytes(4).toString("hex");
	const accountId = `rules-past-${suffix}`;
	const opened = openPostgres(connection);
	await opened.migrate();
	try {
		await retryLockWait(() => replaceDemoAccount(opened.db, accountId, `clerk-${suffix}`));
		const scope = { accountId, mode: "account" as const };
		const repositories = createRepositories(opened.db);
		const kernel = new Kernel(repositories);
		const late = Date.now() - 1;
		const before = await repositories.policy.listRules(scope);
		const first = before[0];
		if (!first) throw new Error("the seed has no rule");
		await assert.rejects(() => kernel.setLimit(scope, adCap, 260, { tab: "deadline", seq: 2 }, late), {
			message: "The workspace write did not finish.",
		});
		await assert.rejects(() => kernel.setRuleOn(scope, first.id, !first.on, { tab: "deadline", seq: 3 }, late), {
			message: "The workspace write did not finish.",
		});
		await assert.rejects(
			() =>
				kernel.addRule(
					scope,
					{ when: "A new order arrives", agent: "orders", action: "Late rule", approval: "Ask first" },
					late,
				),
			{ message: "The workspace write did not finish." },
		);
		assert.equal((await repositories.bus.readStore(scope))[adCap], 200);
		const after = await repositories.policy.listRules(scope);
		assert.equal(after.length, before.length);
		assert.equal(after.find((rule) => rule.id === first.id)?.on, first.on);
	} finally {
		await removeAccount(opened.db, accountId);
		await opened.close();
	}
});
