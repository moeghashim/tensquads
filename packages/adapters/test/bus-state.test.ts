import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "@neondatabase/serverless";
import type { PublishedEvent } from "@tensquads/kernel";
import { AccountBus } from "../src/cloudflare-bus/account-bus.ts";
import { createCloudflareBus } from "../src/cloudflare-bus/http.ts";
import { stateEntries } from "../src/neon/schema.ts";
import { Storage } from "./bus-storage.ts";
import { openPglite } from "./pglite.ts";

test("store restores scoped Neon state once and keeps seeded keys after publication", async (t) => {
	const database = await openPglite();
	const scope = { accountId: "seeded-state", mode: "account" } as const;
	const storages = new Map<string, Storage>();
	const targets = new Map<string, AccountBus>();
	let reads = 0;
	let writes = 0;
	t.mock.method(Pool.prototype, "query", async (config: { text: string; rowMode?: string }, params: unknown[]) => {
		reads += 1;
		const result = await database.client.query<Record<string, unknown>>(config.text, params);
		const rows = config.rowMode === "array" ? result.rows.map((row) => Object.values(row)) : result.rows;
		return { ...result, rows };
	});
	t.mock.method(Pool.prototype, "connect", async () => {
		writes += 1;
		return {
			query: (config: { text: string }, params: unknown[]) => database.client.query(config.text, params),
			release() {},
		};
	});
	const namespace = {
		idFromName: (id: string) => id,
		get(id: unknown) {
			const accountId = String(id);
			let target = targets.get(accountId);
			if (!target) {
				const storage = new Storage();
				storages.set(accountId, storage);
				target = new AccountBus(
					{ storage, acceptWebSocket() {}, getWebSockets: () => [] },
					{ DATABASE_URL: "postgres://fixture/db" },
				);
				targets.set(accountId, target);
			}
			return {
				fetch: (input: Request | string | URL, init?: RequestInit) => target.fetch(new Request(input, init)),
			};
		},
	};
	try {
		await database.client.query(
			`INSERT INTO accounts (id, account_id, name, owner, email, tint, agents, online, tasks, last_active, created_week, mission, sort_order) VALUES ($1, $1, '', '', '', '', 0, 0, 0, '', 0, '', 0)`,
			[scope.accountId],
		);
		const seeded = { limit: 20, status: "ready", detail: { active: true }, absent: null };
		await database.db.insert(stateEntries).values([
			...Object.entries(seeded).map(([key, value]) => ({
				accountId: scope.accountId,
				key,
				value: JSON.stringify(value),
				sortOrder: 0,
			})),
			{ accountId: "other-account", key: "foreign", value: "true", sortOrder: 0 },
		]);
		const adapter = createCloudflareBus(namespace);
		assert.deepEqual(await adapter.store(scope), seeded);
		assert.equal(writes, 0);
		assert.equal(await storages.get(scope.accountId)?.get("state:status"), '"ready"');
		const initializedReads = reads;
		const event: PublishedEvent = {
			id: "new",
			from: "master",
			to: "orders",
			kind: "Result",
			skill: "state",
			text: "Updated.",
			payload: {},
			writes: ["limit", "new"],
			set: { limit: 30, new: [1, 2] },
		};
		await adapter.publish(scope, event);
		assert.deepEqual(await adapter.store(scope), { ...seeded, limit: 30, new: [1, 2] });
		assert.equal(reads, initializedReads);
		assert.equal(writes, 1);
		assert.deepEqual(await adapter.store({ accountId: "empty", mode: "account" }), {});
		assert.equal(writes, 1);
		const target = targets.get(scope.accountId);
		assert.ok(target);
		const refused = await target.fetch(
			new Request("https://bus/store", { headers: { "x-account-id": "other-account" } }),
		);
		assert.equal(refused.status, 400);
		assert.deepEqual(await (await target.fetch(new Request("https://bus/store"))).json(), {
			...seeded,
			limit: 30,
			new: [1, 2],
		});
	} finally {
		await database.close();
	}
});
