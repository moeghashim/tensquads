import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";

import { Pool, type PoolClient } from "@neondatabase/serverless";

import { openPostgres } from "../src/neon/postgres.ts";

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
	const statements = server.events.filter(({ sql }) => sql !== "BEGIN");
	const firstCommit = statements.findIndex(({ sql }) => sql === "COMMIT");
	assert.ok(firstCommit > 1);
	assert.ok(statements.slice(0, firstCommit + 1).every(({ client }) => client === 1));
	assert.ok(statements.slice(firstCommit + 1).every(({ client }) => client === 2));
	for (const client of [1, 2]) {
		const queries = server.events.filter((event) => event.client === client).map(({ sql }) => sql);
		assert.equal(queries[0], "BEGIN");
		assert.match(queries[1] ?? "", /^SELECT pg_advisory_xact_lock\(/);
		assert.equal(queries.at(-1), "COMMIT");
	}
	assert.deepEqual(server.released, [1, 2]);
	await Promise.all([first.close(), second.close()]);
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
	assert.equal(queries[0], "BEGIN");
	assert.equal(queries.at(-1), "ROLLBACK");
	assert.equal(queries.includes("COMMIT"), false);
	assert.equal(released, true);
	await postgres.close();
});
