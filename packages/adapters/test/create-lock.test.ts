import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import type { WorkspaceDraft } from "@tensquads/domain";
import { sql } from "drizzle-orm";

import { createWorkspace } from "../src/neon/create-workspace.ts";
import { type AppDatabase, openPostgres } from "../src/neon/postgres.ts";

const connection = process.env.TEST_DATABASE_URL ?? "";
const globalClass = 1952804467;
const accountClass = 1952804468;
const childTables = [
	"messages",
	"threads",
	"skills",
	"machines",
	"agents",
	"squads",
	"masters",
	"rules",
	"mission_proposals",
	"bus_events",
	"state_entries",
	"daily_revenue",
	"overview_tiles",
	"subscriptions",
	"bus_cursors",
	"accounts",
];

function firstCount(rows: readonly { n: number }[]): number {
	const row = rows[0];
	if (!row) return 0;
	return row.n;
}

function firstPid(rows: readonly { pid: number }[]): number | undefined {
	const row = rows[0];
	if (!row) return undefined;
	return row.pid;
}

function createdFlag(value: { created?: boolean } | undefined): boolean {
	if (!value) return false;
	return value.created === true;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function databaseName(value: string): string {
	return new URL(value).pathname.replace(/^\//, "").split("?")[0] ?? "";
}

function refuseProduction(): void {
	const neon = process.env.NEON_POSTGRES_CONNECTION_STRING;
	if (neon && connection === neon) throw new Error("refusing the Neon connection");
	if (databaseName(connection) === "neondb") throw new Error("refusing the production database");
}

function errorCode(error: unknown, depth = 0): string | undefined {
	const record = errorRecord(error, depth);
	if (!record) return undefined;
	if (typeof record.code === "string") return record.code;
	return errorCode(record.cause, depth + 1);
}

function errorRecord(error: unknown, depth: number): { code?: unknown; cause?: unknown } | undefined {
	if (depth > 5) return undefined;
	if (!error || typeof error !== "object") return undefined;
	return error as { code?: unknown; cause?: unknown };
}

function draft(clerkUserId: string): WorkspaceDraft {
	return {
		clerkUserId,
		email: `${clerkUserId}@example.test`,
		name: "Review",
		mission: "Review",
		agents: [{ id: "orders", name: "Orders", role: "Orders", tint: "#e7efff" }],
	};
}

function pauseAfterLocks(
	db: AppDatabase,
	entered: () => void,
	gate: Promise<void>,
	selected: { value: boolean },
): AppDatabase {
	let paused = false;
	return new Proxy(db, {
		get(current, key, receiver) {
			if (key !== "transaction") {
				const value = Reflect.get(current, key, receiver);
				return typeof value === "function" ? value.bind(current) : value;
			}
			const transaction = Reflect.get(current, key, receiver) as (
				run: (tx: object) => Promise<unknown>,
				...args: unknown[]
			) => Promise<unknown>;
			return (run: (tx: object) => Promise<unknown>, ...args: unknown[]) =>
				transaction.call(
					current,
					(tx) => {
						let executes = 0;
						const holdAfterLocks = async () => {
							executes += 1;
							if (paused || executes !== 2) return;
							paused = true;
							entered();
							await gate;
						};
						return run(
							new Proxy(tx, {
								get(inner, innerKey, innerReceiver) {
									const value = Reflect.get(inner, innerKey, innerReceiver);
									if (innerKey === "select") return countingSelect(inner, value, selected);
									if (innerKey === "execute") return pausingExecute(inner, value, holdAfterLocks);
									return bindOrValue(inner, value);
								},
							}),
						);
					},
					...args,
				);
		},
	}) as AppDatabase;
}

function bindOrValue(target: object, value: unknown): unknown {
	if (typeof value !== "function") return value;
	return value.bind(target);
}

function countingSelect(target: object, value: unknown, selected: { value: boolean }): unknown {
	if (typeof value !== "function") return value;
	return (...selectArgs: unknown[]) => {
		selected.value = true;
		return value.apply(target, selectArgs);
	};
}

function pausingExecute(target: object, value: unknown, after: () => Promise<void>): unknown {
	if (typeof value !== "function") return value;
	return async (...executeArgs: unknown[]) => {
		const result = await value.apply(target, executeArgs);
		await after();
		return result;
	};
}

async function waitForUngranted(client: PoolClient, classId: number): Promise<void> {
	const deadline = Date.now() + 10_000;
	for (;;) {
		const waiting = await client.query<{ n: number }>(
			"SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND classid = $1 AND NOT granted",
			[classId],
		);
		if (firstCount(waiting.rows) > 0) return;
		if (Date.now() >= deadline) throw new Error(`nothing waited on advisory class ${classId}`);
		await delay(50);
	}
}

async function creatorPid(client: PoolClient): Promise<number> {
	const holders = await client.query<{ pid: number }>(
		"SELECT pid FROM pg_locks WHERE locktype = 'advisory' AND classid = $1 AND mode = 'ShareLock' AND granted",
		[globalClass],
	);
	const pid = firstPid(holders.rows);
	if (pid === undefined) throw new Error("the creator does not hold the shared global lock");
	return pid;
}

async function removeClerkUser(clerkUserId: string): Promise<void> {
	const pool = new Pool({ connectionString: connection, max: 1 });
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		await client.query("SELECT pg_advisory_xact_lock(1952804467, 1)");
		const rows = await client.query<{ id: string }>("SELECT id FROM accounts WHERE clerk_user_id = $1", [
			clerkUserId,
		]);
		for (const row of rows.rows) {
			for (const table of childTables) {
				await client.query(`DELETE FROM ${table} WHERE account_id = $1`, [row.id]);
			}
		}
		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
		await pool.end();
	}
}

test("a migration waits on the global lock before workspace creation reads accounts", {
	timeout: 120_000,
	skip: connection.length === 0,
}, async () => {
	refuseProduction();
	const suffix = randomBytes(4).toString("hex");
	const accountId = `create-lock-${suffix}`;
	const clerkUserId = `clerk-${suffix}`;
	const opened = openPostgres(connection);
	const migration = openPostgres(connection);
	const observer = new Pool({ connectionString: connection, max: 1 });
	const client = await observer.connect();
	let release = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let markReady = () => {};
	const locked = new Promise<void>((resolve) => {
		markReady = resolve;
	});
	const selected = { value: false };
	try {
		await opened.migrate();
		await opened.db.execute(sql`UPDATE schema_revision SET version = 'stale' WHERE id = 1`);
		const creator = createWorkspace(
			pauseAfterLocks(opened.db, markReady, gate, selected),
			{ accountId, mode: "account" },
			draft(clerkUserId),
		).then(
			(value) => ({ ok: true as const, value, code: undefined }),
			(error: unknown) => ({ ok: false as const, value: undefined, code: errorCode(error) }),
		);
		await Promise.race([
			locked,
			delay(10_000).then(() => Promise.reject(new Error("creator did not take the lock"))),
		]);
		const migrated = migration.migrate().then(
			() => ({ ok: true as const, code: undefined }),
			(error: unknown) => ({ ok: false as const, code: errorCode(error) }),
		);
		await waitForUngranted(client, globalClass);
		const pid = await creatorPid(client);
		const accountLocks = await client.query<{ n: number }>(
			"SELECT count(*)::int AS n FROM pg_locks WHERE pid = $1 AND relation = 'accounts'::regclass",
			[pid],
		);
		const exclusive = await client.query<{ n: number }>(
			"SELECT count(*)::int AS n FROM pg_locks WHERE relation = 'accounts'::regclass AND mode = 'AccessExclusiveLock' AND NOT granted",
		);
		assert.equal(selected.value, false);
		assert.equal(firstCount(accountLocks.rows), 0);
		assert.equal(firstCount(exclusive.rows), 0);
		release();
		const [created, migratedResult] = await Promise.all([creator, migrated]);
		assert.equal(created.code, undefined);
		assert.equal(migratedResult.code, undefined);
		assert.equal(created.ok, true);
		assert.equal(createdFlag(created.value), true);
		assert.equal(migratedResult.ok, true);
		assert.equal(selected.value, true);
	} finally {
		release();
		client.release();
		await observer.end();
		try {
			await removeClerkUser(clerkUserId);
		} finally {
			await opened.close();
			await migration.close();
		}
	}
});

test("two creates for one Clerk user make one account and do not deadlock", {
	timeout: 120_000,
	skip: connection.length === 0,
}, async () => {
	refuseProduction();
	const suffix = randomBytes(4).toString("hex");
	const clerkUserId = `clerk-pair-${suffix}`;
	const firstId = `create-a-${suffix}`;
	const secondId = `create-b-${suffix}`;
	const opened = openPostgres(connection);
	const other = openPostgres(connection);
	const observer = new Pool({ connectionString: connection, max: 1 });
	const client = await observer.connect();
	let release = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let markReady = () => {};
	const locked = new Promise<void>((resolve) => {
		markReady = resolve;
	});
	try {
		await opened.migrate();
		let firstDone = false;
		let secondDone = false;
		const first = createWorkspace(
			pauseAfterLocks(opened.db, markReady, gate, { value: false }),
			{ accountId: firstId, mode: "account" },
			draft(clerkUserId),
		).finally(() => {
			firstDone = true;
		});
		await Promise.race([
			locked,
			delay(10_000).then(() => Promise.reject(new Error("first create did not take the lock"))),
		]);
		const second = createWorkspace(other.db, { accountId: secondId, mode: "account" }, draft(clerkUserId)).finally(
			() => {
				secondDone = true;
			},
		);
		await waitForUngranted(client, accountClass);
		assert.equal(firstDone, false);
		assert.equal(secondDone, false);
		release();
		const [firstResult, secondResult] = await Promise.all([first, second]);
		const created = [firstResult, secondResult].filter((result) => result.created);
		assert.equal(created.length, 1);
		assert.equal(firstResult.accountId, secondResult.accountId);
		const rows = await client.query<{ n: number }>(
			"SELECT count(*)::int AS n FROM accounts WHERE clerk_user_id = $1",
			[clerkUserId],
		);
		assert.equal(firstCount(rows.rows), 1);
	} finally {
		release();
		client.release();
		await observer.end();
		try {
			await removeClerkUser(clerkUserId);
		} finally {
			await opened.close();
			await other.close();
		}
	}
});
