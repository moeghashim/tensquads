import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";

import { Pool, type PoolClient } from "@neondatabase/serverless";

import { migrationRevision, openPostgres } from "../src/neon/postgres.ts";

function migrationServer() {
	const events: { client: number; sql: string }[] = [];
	const released: number[] = [];
	let lock = Promise.resolve();
	let nextClient = 0;
	return {
		events,
		released,
		connect() {
			const client = ++nextClient;
			let unlock = () => {};
			return {
				async query(sql: string) {
					if (sql.startsWith("SELECT pg_advisory_xact_lock(")) {
						const previous = lock;
						lock = new Promise<void>((resolve) => {
							unlock = resolve;
						});
						await previous;
					}
					events.push({ client, sql });
					if (sql === "COMMIT" || sql === "ROLLBACK") unlock();
					await setImmediate();
					return { rows: [] };
				},
				release() {
					released.push(client);
				},
			} as unknown as PoolClient;
		},
	};
}

test("overlapping Postgres migrations serialize all statements in transactions", async (context) => {
	const server = migrationServer();
	context.mock.method(Pool.prototype, "connect", async () => server.connect());
	const first = openPostgres("postgres://test");
	const second = openPostgres("postgres://test");
	await Promise.all([first.migrate(), second.migrate()]);
	const locks = server.events.filter(({ sql }) => sql.startsWith("SELECT pg_advisory_xact_lock("));
	assert.equal(locks.length, 2);
	const leaderLock = locks[0];
	const follower = locks[1];
	assert.ok(leaderLock);
	assert.ok(follower);
	const leaderCommit = server.events.findIndex(
		(event) => event.client === leaderLock.client && event.sql === "COMMIT",
	);
	const followerLock = server.events.indexOf(follower);
	assert.ok(leaderCommit > 1);
	assert.ok(followerLock > leaderCommit);
	for (const client of [leaderLock.client, follower.client]) {
		const queries = server.events.filter((event) => event.client === client).map(({ sql }) => sql);
		const begin = queries.indexOf("BEGIN");
		assert.ok(begin > 0);
		assert.match(queries[begin + 1] ?? "", /^SELECT pg_advisory_xact_lock\(/);
		assert.equal(queries.at(-1), "COMMIT");
		assert.equal(
			queries.some((sql) => sql.startsWith("INSERT INTO schema_revision")),
			true,
		);
	}
	assert.deepEqual(server.released, [1, 2]);
	await Promise.all([first.close(), second.close()]);
});

test("a current revision does not lock or run the migration", async (context) => {
	const queries: string[] = [];
	context.mock.method(Pool.prototype, "connect", async () => ({
		async query(sql: string) {
			queries.push(sql);
			if (sql.includes("to_regclass")) return { rows: [{ name: "schema_revision" }] };
			if (sql.startsWith("SELECT version")) return { rows: [{ version: migrationRevision }] };
			return { rows: [] };
		},
		release() {},
	}));
	const postgres = openPostgres("postgres://test");
	await postgres.migrate();
	assert.deepEqual(queries, [
		"SELECT to_regclass('public.schema_revision') AS name",
		"SELECT version FROM schema_revision WHERE id = 1",
	]);
	await postgres.close();
});

test("a failed Postgres migration rolls back and releases its client", async (context) => {
	const queries: string[] = [];
	const failure = new Error("Migration failed");
	let released = false;
	context.mock.method(Pool.prototype, "connect", async () => ({
		async query(sql: string) {
			queries.push(sql);
			if (sql.startsWith("CREATE TABLE")) throw failure;
			return { rows: [] };
		},
		release() {
			released = true;
		},
	}));
	const postgres = openPostgres("postgres://test");
	await assert.rejects(postgres.migrate(), (error) => error === failure);
	const begin = queries.indexOf("BEGIN");
	assert.ok(begin > 0);
	assert.match(queries[begin + 1] ?? "", /^SELECT pg_advisory_xact_lock\(/);
	assert.equal(queries.at(-1), "ROLLBACK");
	assert.equal(queries.includes("COMMIT"), false);
	assert.equal(released, true);
	await postgres.close();
});
