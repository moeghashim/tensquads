import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { type AppDatabase, createRepositories, schema } from "@tensquads/adapters";
import { Kernel } from "@tensquads/kernel";
import { eq } from "drizzle-orm";

import { replaceDemoAccount } from "../../seed/src/demo-account.ts";
import { openPostgres } from "../src/neon/postgres.ts";
import { PENDING_TASK_WINDOW_MS } from "../src/pending-window.ts";

const connection = process.env.TEST_DATABASE_URL ?? "";
const globalClass = 1952804467;
const accountClass = 1952804468;

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
	if (!error || typeof error !== "object" || depth > 5) return undefined;
	const record = error as { code?: unknown; cause?: unknown };
	if (typeof record.code === "string") return record.code;
	return errorCode(record.cause, depth + 1);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(message)), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}

async function waitForUngranted(client: PoolClient, classId: number): Promise<void> {
	const deadline = Date.now() + 10_000;
	for (;;) {
		const waiting = await client.query<{ n: number }>(
			"SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND classid = $1 AND NOT granted",
			[classId],
		);
		if ((waiting.rows[0]?.n ?? 0) > 0) return;
		if (Date.now() >= deadline) throw new Error(`nothing waited on advisory class ${classId}`);
		await delay(50);
	}
}

async function removeAccount(db: AppDatabase, accountId: string): Promise<void> {
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

function sqlText(query: object): string {
	const candidate = query as {
		toSQL?: () => { sql?: string };
		getSQL?: () => unknown;
		getQuery?: () => unknown;
	};
	const readers = [candidate.toSQL, candidate.getSQL, candidate.getQuery];
	for (const read of readers) {
		if (typeof read !== "function") continue;
		const built = read.call(candidate);
		if (typeof built === "string") return built;
		if (built && typeof built === "object" && "sql" in built && typeof built.sql === "string") return built.sql;
	}
	return "";
}

function watchAgents(
	query: object,
	entered: () => void,
	gate: Promise<void>,
	paused: { value: boolean },
	seen: string[],
): object {
	return new Proxy(query, {
		get(current, key, receiver) {
			if (key === "then") {
				const then = Reflect.get(current, key, receiver) as (
					yes: (value: unknown) => unknown,
					no?: (error: unknown) => unknown,
				) => Promise<unknown>;
				return (yes: (value: unknown) => unknown, no?: (error: unknown) => unknown) =>
					then
						.call(
							current,
							async (value: unknown) => {
								const text = sqlText(current);
								if (text.length > 0) seen.push(text.slice(0, 140));
								if (!paused.value && text.includes('from "agents"')) {
									paused.value = true;
									entered();
									await gate;
								}
								return value;
							},
							no,
						)
						.then(yes, no);
			}
			const value = Reflect.get(current, key, receiver);
			if (typeof value !== "function") return value;
			return (...args: unknown[]) => {
				const result = value.apply(current, args);
				if (result && typeof result === "object" && ("toSQL" in result || "getSQL" in result || "then" in result)) {
					return watchAgents(result, entered, gate, paused, seen);
				}
				return result;
			};
		},
	});
}

function pauseAtAgents(db: AppDatabase, entered: () => void, gate: Promise<void>, seen: string[]): AppDatabase {
	const paused = { value: false };
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
					(tx) =>
						run(
							new Proxy(tx, {
								get(inner, key, innerReceiver) {
									const value = Reflect.get(inner, key, innerReceiver);
									if (key !== "select" || typeof value !== "function") {
										return typeof value === "function" ? value.bind(inner) : value;
									}
									return (...selectArgs: unknown[]) =>
										watchAgents(value.apply(inner, selectArgs) as object, entered, gate, paused, seen);
								},
							}),
						),
					...args,
				);
		},
	}) as AppDatabase;
}

function pauseBeforeCommit(db: AppDatabase, entered: () => void, gate: Promise<void>): AppDatabase {
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
					async (tx) => {
						const value = await run(tx);
						entered();
						await gate;
						return value;
					},
					...args,
				);
		},
	}) as AppDatabase;
}

test("a migration waits for an approval and neither side deadlocks", {
	timeout: 120_000,
	skip: connection.length === 0,
}, async () => {
	refuseProduction();
	const suffix = randomBytes(4).toString("hex");
	const accountId = `writer-lock-${suffix}`;
	const opened = openPostgres(connection);
	const migration = openPostgres(connection);
	const observer = new Pool({ connectionString: connection, max: 1 });
	const client = await observer.connect();
	let release = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let markReady = () => {};
	const agentsReady = new Promise<void>((resolve) => {
		markReady = resolve;
	});
	try {
		await opened.migrate();
		await replaceDemoAccount(opened.db, accountId, `clerk-${suffix}`);
		const scope = { accountId, mode: "account" as const };
		const seen: string[] = [];
		const kernel = new Kernel(createRepositories(pauseAtAgents(opened.db, markReady, gate, seen)));
		const approval = kernel.decide(scope, "ap1", true).then(
			(row) => ({ ok: true as const, status: row.status, code: undefined }),
			(error: unknown) => ({
				ok: false as const,
				status: undefined,
				code: errorCode(error),
				message: error instanceof Error ? error.message.slice(0, 240) : "",
			}),
		);
		const reached = await Promise.race([
			agentsReady.then(() => "ready" as const),
			approval.then((result) => result),
			delay(10_000).then(() => "timeout" as const),
		]);
		if (reached !== "ready") {
			const detail = reached === "timeout" ? "timeout" : JSON.stringify(reached);
			throw new Error(`approval did not pause on agents: ${detail} sql=${seen.join(" || ")}`);
		}
		const migrated = migration.migrate().then(
			() => ({ ok: true as const, code: undefined }),
			(error: unknown) => ({ ok: false as const, code: errorCode(error) }),
		);
		await waitForUngranted(client, globalClass);
		release();
		const [approvalResult, migrationResult] = await Promise.all([approval, migrated]);
		assert.equal(approvalResult.code, undefined);
		assert.equal(migrationResult.code, undefined);
		assert.equal(approvalResult.ok, true);
		assert.equal(approvalResult.status, "Approved");
		assert.equal(migrationResult.ok, true);
	} finally {
		release();
		client.release();
		await observer.end();
		try {
			await removeAccount(opened.db, accountId);
		} finally {
			await opened.close();
			await migration.close();
		}
	}
});

test("one account's writers exclude each other", { timeout: 120_000, skip: connection.length === 0 }, async () => {
	refuseProduction();
	const suffix = randomBytes(4).toString("hex");
	const accountId = `writer-pair-${suffix}`;
	const opened = openPostgres(connection);
	const other = openPostgres(connection);
	const observer = new Pool({ connectionString: connection, max: 1 });
	const client = await observer.connect();
	let release = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let markReady = () => {};
	const held = new Promise<void>((resolve) => {
		markReady = resolve;
	});
	try {
		await opened.migrate();
		await replaceDemoAccount(opened.db, accountId, `clerk-${suffix}`);
		const scope = { accountId, mode: "account" as const };
		const deadline = () => Date.now() + PENDING_TASK_WINDOW_MS;
		const firstKernel = new Kernel(createRepositories(pauseBeforeCommit(opened.db, markReady, gate)));
		const secondKernel = new Kernel(createRepositories(other.db));
		let firstDone = false;
		let secondDone = false;
		const first = firstKernel
			.setAgentOn(scope, "support", false, { tab: "pair-a", seq: 1 }, deadline())
			.finally(() => {
				firstDone = true;
			});
		await withTimeout(held, 10_000, "the first writer did not reach its commit");
		const second = secondKernel
			.setAgentOn(scope, "support", false, { tab: "pair-b", seq: 1 }, deadline())
			.finally(() => {
				secondDone = true;
			});
		await waitForUngranted(client, accountClass);
		assert.equal(firstDone, false);
		assert.equal(secondDone, false);
		release();
		const [firstResult, secondResult] = await Promise.all([first, second]);
		assert.equal(firstResult.status, "written");
		assert.equal(secondResult.status, "written");
		const stored = await client.query<{ is_on: boolean }>(
			"SELECT is_on FROM agents WHERE account_id = $1 AND id = 'support'",
			[accountId],
		);
		assert.equal(stored.rows[0]?.is_on, false);
	} finally {
		release();
		client.release();
		await observer.end();
		try {
			await removeAccount(opened.db, accountId);
		} finally {
			await opened.close();
			await other.close();
		}
	}
});
