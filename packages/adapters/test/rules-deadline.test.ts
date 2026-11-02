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
const lockKey = "SELECT pg_try_advisory_lock(1952804467, 1)";
const unlockKey = "SELECT pg_advisory_unlock(1952804467, 1)";
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

async function holdLock(client: PoolClient): Promise<void> {
	const deadline = Date.now() + 90_000;
	for (;;) {
		const acquired = await client.query<{ pg_try_advisory_lock: boolean }>(lockKey);
		if (acquired.rows[0]?.pg_try_advisory_lock) return;
		if (Date.now() >= deadline) throw new Error("the workspace lock stayed busy");
		await delay(250);
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
		await holdLock(client);
		locked = true;
		let settled = "pending";
		const write = kernel.setLimit(scope, adCap, 240).then(
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
		await client.query(unlockKey);
		locked = false;
		if (raced === "waiting") await write;
		const store = await repositories.bus.readStore(scope);
		assert.equal(store[adCap], 200);
		assert.equal(settled, "rejected");
	} finally {
		if (locked) await client.query(unlockKey).catch(() => undefined);
		client.release();
		await holder.end();
		await removeAccount(opened.db, accountId);
		await opened.close();
	}
});
