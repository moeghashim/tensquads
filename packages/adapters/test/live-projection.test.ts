import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "@neondatabase/serverless";
import type { PublishedEvent } from "@tensquads/kernel";

import { writePending } from "../src/cloudflare-bus/neon-write.ts";
import { openPglite } from "./pglite.ts";

const accountId = "proj-proof";
const url = "postgres://fixture/db";

function routePool(t: test.TestContext, database: Awaited<ReturnType<typeof openPglite>>) {
	t.mock.method(Pool.prototype, "query", async (config: { text: string; rowMode?: string }, params: unknown[]) => {
		const result = await database.client.query<Record<string, unknown>>(config.text, params);
		const rows = config.rowMode === "array" ? result.rows.map((row) => Object.values(row)) : result.rows;
		return { ...result, rows };
	});
	t.mock.method(Pool.prototype, "connect", async () => ({
		query: (config: { text: string }, params: unknown[]) => database.client.query(config.text, params),
		release() {},
	}));
}

function row(
	id: string,
	skill: string,
	from: string,
	kind: PublishedEvent["kind"],
	payload: PublishedEvent["payload"],
	set?: PublishedEvent["set"],
): { seq: number; event: PublishedEvent } {
	return {
		seq: 1,
		event: { id, from, to: "master", kind, skill, text: skill, payload, writes: [], ...(set ? { set } : {}) },
	};
}

test("a new result increments the skill run once and inserts the preview link", async (t) => {
	const database = await openPglite();
	routePool(t, database);
	try {
		await database.client.query(
			`INSERT INTO accounts (id, account_id, name, owner, email, tint, agents, online, tasks, last_active, created_week, mission, sort_order) VALUES ($1, $1, '', 'Moe', '', '', 0, 0, 0, '', 0, '', 0)`,
			[accountId],
		);
		await database.client.query(
			`INSERT INTO agents (account_id, id, name, role, tint, is_on, autonomy, mission, contribution, tasks, success, saved, last_text, targets, kpis, sort_order) VALUES ($1, 'market', 'Market', 'Researcher', '', true, 'Ask first', '', 0, 0, '0%', '0h', '', '[]', '[]', 1)`,
			[accountId],
		);
		await database.client.query(
			`INSERT INTO skills (account_id, agent_id, id, description, gate, runs, is_on, sort_order) VALUES ($1, 'market', 'web.search', '', 'Ask first', 1, true, 0)`,
			[accountId],
		);
		const found = row("r-1", "web.search", "market", "Result", {});
		await writePending(url, accountId, [found]);
		await writePending(url, accountId, [found]);
		await writePending(url, accountId, [row("r-2", "web.search", "master", "Result", {})]);
		await writePending(url, accountId, [row("r-3", "web.search", "missing", "Result", {})]);
		const preview = row("r-4", "site.preview", "website", "Result", { previewUrl: "https://preview.example/proof" });
		await writePending(url, accountId, [preview]);
		await writePending(url, accountId, [preview]);
		await writePending(url, accountId, [
			row("r-5", "task.route", "market", "Task", {}, { machineExp: { market: 9999 } }),
		]);
		const runs = (await database.client.query("SELECT agent_id, id, runs FROM skills ORDER BY agent_id, id")).rows;
		assert.deepEqual(runs, [{ agent_id: "market", id: "web.search", runs: 2 }]);
		const messages = (await database.client.query("SELECT id, from_role, body FROM messages ORDER BY id")).rows;
		assert.deepEqual(messages, [
			{ id: "preview-r-4", from_role: "master", body: "The site preview is https://preview.example/proof" },
		]);
		const state = (await database.client.query("SELECT key, value FROM state_entries")).rows;
		assert.deepEqual(state, [{ key: "machineExp", value: JSON.stringify({ market: 9999 }) }]);
	} finally {
		await database.close();
	}
});
