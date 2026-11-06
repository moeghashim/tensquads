import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "@neondatabase/serverless";
import type { PublishedEvent } from "@tensquads/kernel";

import { writePending } from "../src/cloudflare-bus/neon-write.ts";
import { openPglite } from "./pglite.ts";

const event: PublishedEvent = {
	id: "valid",
	from: "master",
	to: "researcher",
	kind: "Task",
	skill: "research",
	text: "Look at the market.",
	payload: {},
	writes: [],
};

function deferred() {
	let resolve = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

test("a write for one account does not wait on another account's write", async (t) => {
	const database = await openPglite();
	const release = deferred();
	let connections = 0;
	let secondEntered = false;
	t.mock.method(Pool.prototype, "query", async (config: { text: string; rowMode?: string }, params: unknown[]) => {
		const result = await database.client.query<Record<string, unknown>>(config.text, params);
		const rows = config.rowMode === "array" ? result.rows.map((row) => Object.values(row)) : result.rows;
		return { ...result, rows };
	});
	t.mock.method(Pool.prototype, "connect", async () => {
		connections += 1;
		if (connections === 1) await release.promise;
		else secondEntered = true;
		return {
			query: (config: { text: string }, params: unknown[]) => database.client.query(config.text, params),
			release() {},
		};
	});
	try {
		for (const accountId of ["queue-a", "queue-b"]) {
			await database.client.query(
				`INSERT INTO accounts (id, account_id, name, owner, email, tint, agents, online, tasks, last_active, created_week, mission, sort_order) VALUES ($1, $1, '', '', '', '', 0, 0, 0, '', 0, '', 0)`,
				[accountId],
			);
		}
		const first = writePending("postgres://fixture/db", "queue-a", [{ seq: 1, event }]);
		for (let tick = 0; tick < 20 && connections === 0; tick += 1) await new Promise((done) => setImmediate(done));
		assert.equal(connections, 1);
		const second = writePending("postgres://fixture/db", "queue-b", [{ seq: 1, event }]);
		for (let tick = 0; tick < 10; tick += 1) await new Promise((done) => setImmediate(done));
		assert.equal(secondEntered, true);
		release.resolve();
		await first;
		await second;
	} finally {
		release.resolve();
		await database.close();
	}
});
