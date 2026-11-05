import assert from "node:assert/strict";
import test from "node:test";
import type { AppDatabase } from "@tensquads/adapters";
import { and, eq } from "drizzle-orm";

import { replaceDemoAccount } from "../../seed/src/demo-account.ts";
import type { DeliverUserEvent, UserMasterEvent } from "../src/neon/commands/approval-bus.ts";
import { decide } from "../src/neon/commands/approvals.ts";
import { schema } from "../src/neon/schema.ts";
import { openPglite } from "./pglite.ts";

function scope(accountId: string) {
	return { accountId, mode: "account" as const };
}

async function withDemo(name: string, run: (db: AppDatabase, accountId: string) => Promise<void>) {
	const { db, close } = await openPglite();
	const accountId = `deliver-${name}`;
	try {
		await replaceDemoAccount(db, accountId, `clerk-${name}`);
		const previous = process.env.ADAPTERS;
		process.env.ADAPTERS = "real";
		try {
			await run(db, accountId);
		} finally {
			if (previous === undefined) delete process.env.ADAPTERS;
			else process.env.ADAPTERS = previous;
		}
	} finally {
		await close();
	}
}

async function status(db: AppDatabase, accountId: string, id: string) {
	const rows = await db
		.select({ status: schema.approvals.status })
		.from(schema.approvals)
		.where(andAccount(accountId, id));
	return rows[0]?.status;
}

function andAccount(accountId: string, id: string) {
	return and(eq(schema.approvals.accountId, accountId), eq(schema.approvals.id, id));
}

async function deliveries(db: AppDatabase, accountId: string) {
	return db.select().from(schema.approvalDeliveries).where(eq(schema.approvalDeliveries.accountId, accountId));
}

test("a rule failure does not deliver, and the approval stays pending", async () => {
	await withDemo("rule", async (db, accountId) => {
		await db.insert(schema.approvals).values({
			accountId,
			id: "ap-orders",
			agent: "orders",
			title: "Ship a gift",
			detail: "A note.",
			amount: "$0",
			status: "Pending",
			sortOrder: 99,
		});
		let calls = 0;
		const deliver: DeliverUserEvent = async () => {
			calls += 1;
		};
		await assert.rejects(() => decide(db, scope(accountId), "ap-orders", true, undefined, deliver));
		assert.equal(calls, 0);
		assert.equal(await status(db, accountId, "ap-orders"), "Pending");
		assert.equal((await deliveries(db, accountId)).length, 0);
	});
});

test("a failed delivery leaves the committed decision and retries the same event once", async () => {
	await withDemo("retry", async (db, accountId) => {
		const seen = new Set<string>();
		const tasks: string[] = [];
		const calls: string[] = [];
		let crash = true;
		const deliver: DeliverUserEvent = async (_accountId, event) => {
			calls.push(event.id);
			if (seen.has(event.id)) return;
			seen.add(event.id);
			tasks.push(event.id);
			if (crash) {
				crash = false;
				throw new Error("The bus write failed.");
			}
		};
		await assert.rejects(() => decide(db, scope(accountId), "ap1", true, undefined, deliver));
		assert.equal(await status(db, accountId, "ap1"), "Approved");
		assert.equal(calls.length, 1);
		assert.equal(tasks.length, 1);
		const pending = await deliveries(db, accountId);
		assert.equal(pending.length, 1);
		const stored = pending[0];
		assert.ok(stored);
		assert.equal(stored.event.id, "user-ap1");
		await decide(db, scope(accountId), "ap1", true, undefined, deliver);
		assert.equal(calls.length, 2);
		assert.equal(calls[1], calls[0]);
		assert.equal(tasks.length, 1);
		assert.equal((await deliveries(db, accountId)).length, 0);
		await decide(db, scope(accountId), "ap1", true, undefined, deliver);
		assert.equal(calls.length, 2);
	});
});

test("a master ask is approved without a policy rule and reaches the master", async () => {
	await withDemo("ask", async (db, accountId) => {
		await db.insert(schema.agents).values({
			accountId,
			id: "website",
			name: "Website builder",
			role: "Website builder",
			tint: "#e5e9f0",
			isOn: true,
			autonomy: "Ask first",
			mission: "Build one page from the brief.",
			contribution: 0,
			tasks: 0,
			success: "0%",
			saved: "0h",
			lastText: "",
			targets: [["Pages", "0", "1"]],
			kpis: [["Tasks", "0"]],
			sortOrder: 9,
		});
		await db.insert(schema.approvals).values({
			accountId,
			id: "m-01",
			agent: "website",
			title: "Build the site with this brief?",
			detail: "Serve lunch.",
			amount: "",
			status: "Pending",
			sortOrder: 8,
		});
		const delivered: UserMasterEvent[] = [];
		const deliver: DeliverUserEvent = async (_accountId, event) => {
			delivered.push(event);
		};
		await decide(db, scope(accountId), "m-01", true, undefined, deliver);
		assert.equal(await status(db, accountId, "m-01"), "Approved");
		assert.equal(delivered.length, 1);
		assert.equal(delivered[0]?.id, "user-m-01");
		assert.equal(delivered[0]?.skill, "brief.write");
		assert.equal(delivered[0]?.kind, "Approval");
		const mandates = await db
			.select({ id: schema.mandates.approvalId })
			.from(schema.mandates)
			.where(eqAccount(accountId));
		assert.equal(mandates.length, 0);
		assert.equal((await deliveries(db, accountId)).length, 0);
		await decide(db, scope(accountId), "m-01", true, undefined, deliver);
		assert.equal(delivered.length, 1);
	});
});

function eqAccount(accountId: string) {
	return eq(schema.mandates.accountId, accountId);
}
