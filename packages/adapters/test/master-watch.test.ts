import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { Pool } from "@neondatabase/serverless";
import { createMaster, type StoredGrant } from "@tensquads/domain/master";
import type { PublishedEvent } from "@tensquads/kernel";
import { eq } from "drizzle-orm";

import { replaceDemoAccount } from "../../seed/src/demo-account.ts";
import { writePending } from "../src/cloudflare-bus/neon-write.ts";
import { decide } from "../src/neon/commands/approvals.ts";
import { schema } from "../src/neon/schema.ts";
import { openPglite } from "./pglite.ts";

const url = "postgres://fixture/db";
const accountId = "watch-proof";
const scope = { accountId, mode: "account" as const };
const query = "Proof Kitchen Levantine restaurant competitors menu prices";

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

test("the owner can approve competitor watching", async (t) => {
	const database = await openPglite();
	routePool(t, database);
	try {
		await replaceDemoAccount(database.db, accountId, "clerk-watch");
		await database.db.insert(schema.agents).values({
			accountId,
			id: "market",
			name: "Market researcher",
			role: "Market researcher",
			tint: "#e5e9f0",
			isOn: true,
			autonomy: "Ask first",
			mission: "Watch competitors.",
			contribution: 0,
			tasks: 0,
			success: "0%",
			saved: "0h",
			lastText: "",
			targets: [["Pages", "0", "1"]],
			kpis: [["Tasks", "0"]],
			sortOrder: 8,
		});
		const subject = createHash("sha256").update(query).digest("hex");
		const event: PublishedEvent = {
			id: "m-watch",
			from: "master",
			to: "user",
			kind: "Approval",
			skill: "competition.watch",
			text: "Watch the competitors?",
			payload: { query, taskId: "task-1", skill: "competition.watch", subject },
			writes: [],
		};
		await writePending(url, accountId, [{ seq: 1, event }]);
		const inbox = (
			await database.client.query("SELECT agent, title, detail, status FROM approvals WHERE id = 'm-watch'")
		).rows;
		assert.deepEqual(inbox, [
			{
				agent: "market",
				title: "Watch the competitors?",
				detail: query,
				status: "Pending",
			},
		]);
		const chat = (await database.client.query("SELECT body FROM messages WHERE id = 'watch-m-watch'")).rows;
		assert.deepEqual(chat, [{ body: "Watch the competitors?" }]);

		const previous = process.env.ADAPTERS;
		process.env.ADAPTERS = "real";
		try {
			const refused = await decide(
				database.db,
				scope,
				"m-watch",
				true,
				undefined,
				async () => {},
				undefined,
				"master",
			);
			assert.equal(refused.status, "Pending");

			const delivered: { skill?: string }[] = [];
			const accepted = await decide(
				database.db,
				scope,
				"m-watch",
				true,
				undefined,
				async (_id, row) => {
					delivered.push(row);
				},
				undefined,
				"clerk-watch",
			);
			assert.equal(accepted.status, "Approved");
			assert.equal(delivered[0]?.skill, "competition.watch");
		} finally {
			if (previous === undefined) delete process.env.ADAPTERS;
			else process.env.ADAPTERS = previous;
		}
		const rows = await database.db.select().from(schema.mandates).where(eq(schema.mandates.accountId, accountId));
		assert.equal(rows.length, 1);
		const stored = rows[0];
		assert.ok(stored?.saidAt);
		assert.ok(stored.expiresAt);
		assert.equal(stored.skill, "competition.watch");
		assert.equal(stored.subject, subject);
		assert.equal(stored.taskId, "task-1");
		assert.equal(stored.saidYes, "clerk-watch");
		assert.equal(stored.slug, null);
		assert.equal(stored.expiresAt.getTime(), stored.saidAt.getTime() + 24 * 60 * 60 * 1000);

		const grant: StoredGrant = {
			accountId: stored.accountId,
			taskId: stored.taskId ?? "",
			skill: stored.skill ?? "",
			subject: stored.subject ?? "",
			slug: stored.slug,
			saidYes: stored.saidYes,
			saidAt: stored.saidAt.toISOString(),
			expiresAt: stored.expiresAt.toISOString(),
		};
		const master = createMaster(
			{
				businessName: "Proof Kitchen",
				businessType: "restaurant",
				cuisine: "Levantine",
				items: [{ name: "Chicken tawook", price: "14", section: "Mains" }],
			},
			{
				readPage: async () => ({ status: 404, body: "" }),
				audit: () => ({ keyboard: true, contrast: true, horizontalScroll: false }),
				accountId,
				ownerId: "clerk-watch",
				now: grant.saidAt,
				loadGrant: async () => grant,
			},
		);
		master.restore({
			phase: "watch",
			researchFails: 0,
			pageFails: 0,
			watchFails: 0,
			runTaskId: "task-1",
			retryPayload: {},
			seq: 1,
		});
		const sent = await master.accept({
			id: "user-watch",
			time: grant.saidAt,
			from: "user",
			to: "master",
			kind: "Approval",
			skill: "competition.watch",
			text: "Yes",
			payload: {},
			writes: [],
			trace: "tr_watch",
		});
		const task = sent.find((event) => event.kind === "Task");
		assert.equal(task?.to, "market");
		assert.equal(task?.text, "Watch the competitors.");
		assert.equal(task?.payload.businessName, "Proof Kitchen");
		assert.equal(task?.payload.businessType, "restaurant");
		assert.equal(task?.payload.cuisine, "Levantine");
		const approval = task?.payload.approval;
		assert.equal(
			approval !== null && typeof approval === "object" && "skill" in approval ? approval.skill : "",
			"competition.watch",
		);
		assert.equal(master.snapshot().phase, "watching");
	} finally {
		await database.close();
	}
});
