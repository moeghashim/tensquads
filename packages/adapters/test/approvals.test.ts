import assert from "node:assert/strict";
import test from "node:test";
import { type AppDatabase, createRepositories, schema } from "@tensquads/adapters";
import { policyVersion } from "@tensquads/domain";
import { Kernel } from "@tensquads/kernel";
import { and, asc, eq } from "drizzle-orm";
import { replaceDemoAccount } from "../../seed/src/demo-account.ts";
import { openPglite } from "./pglite.ts";

const refund = "Refund $42 on #A-1012";

function scope(accountId: string) {
	return { accountId, mode: "account" as const };
}

async function withDemo(name: string, run: (db: AppDatabase, accountId: string) => Promise<void>) {
	const { db, close } = await openPglite();
	const accountId = `overview-${name}`;
	try {
		await replaceDemoAccount(db, accountId, `clerk-${name}`);
		await run(db, accountId);
	} finally {
		await close();
	}
}

function kernel(db: AppDatabase) {
	return new Kernel(createRepositories(db));
}

async function generated(db: AppDatabase, accountId: string) {
	const rows = await db.select().from(schema.busEvents).where(eq(schema.busEvents.accountId, accountId));
	return rows.filter((row) => /^e\d+$/.test(row.id)).sort((left, right) => left.seq - right.seq);
}

async function oneAgent(db: AppDatabase, accountId: string, id: string) {
	const rows = await db
		.select()
		.from(schema.agents)
		.where(and(eq(schema.agents.accountId, accountId), eq(schema.agents.id, id)));
	const row = rows[0];
	assert.ok(row);
	return row;
}

async function oneApproval(db: AppDatabase, accountId: string, id: string) {
	const rows = await db
		.select()
		.from(schema.approvals)
		.where(and(eq(schema.approvals.accountId, accountId), eq(schema.approvals.id, id)));
	return rows[0];
}

async function mandateRow(db: AppDatabase, accountId: string, approvalId: string) {
	return createRepositories(db).policy.mandate(scope(accountId), approvalId);
}

async function versionOf(db: AppDatabase, accountId: string) {
	const rules = await createRepositories(db).policy.listRules(scope(accountId));
	return policyVersion(rules);
}

test("approve writes one Mandate in the same transaction as the Approval", async () => {
	await withDemo("approve", async (db, accountId) => {
		const before = await oneAgent(db, accountId, "support");
		assert.equal(before.tasks, 96);
		const row = await kernel(db).decide(scope(accountId), "ap1", true);
		const again = await kernel(db).decide(scope(accountId), "ap1", true);
		const inbox = await createRepositories(db).policy.inbox(scope(accountId));
		assert.equal(row.id, "ap1");
		assert.equal(row.status, "Approved");
		assert.equal(row.count, inbox.count);
		assert.deepEqual(again, row);
		const events = await generated(db, accountId);
		assert.equal(events.length, 1);
		assert.equal(events[0]?.kind, "Approval");
		assert.equal(events[0]?.skill, "-");
		assert.equal(events[0]?.body, `Approved: ${refund}`);
		assert.deepEqual(events[0]?.payload, { approval_id: "ap1", approved: true, by: "Moe" });
		const agent = await oneAgent(db, accountId, "support");
		assert.equal(agent.tasks, 97);
		assert.equal(agent.lastText, `${refund} (approved)`);
		const stored = await db
			.select()
			.from(schema.stateEntries)
			.where(and(eq(schema.stateEntries.accountId, accountId), eq(schema.stateEntries.key, "approvals.ap1")));
		assert.equal(JSON.parse(stored[0]?.value ?? "null"), "approved");
		const mandate = await mandateRow(db, accountId, "ap1");
		assert.ok(mandate);
		assert.equal(mandate.ruleId, "r1");
		assert.equal(mandate.limitValue, 50);
		assert.equal(mandate.saidYes, "Moe");
		assert.equal(mandate.policyVersion, await versionOf(db, accountId));
		assert.equal(await mandateRow(db, accountId, "ap3"), null);
		const rows = await db.select().from(schema.mandates).where(eq(schema.mandates.accountId, accountId));
		assert.equal(rows.length, 1);
	});
});

test("decline writes the event and no Mandate, and the agent stays", async () => {
	await withDemo("decline", async (db, accountId) => {
		const before = await oneAgent(db, accountId, "marketing");
		await kernel(db).decide(scope(accountId), "ap2", false);
		const events = await generated(db, accountId);
		assert.equal(events.length, 1);
		assert.equal(events[0]?.kind, "Declined");
		assert.deepEqual(events[0]?.payload, {
			approval_id: "ap2",
			approved: false,
			by: "Moe",
		});
		assert.equal(await mandateRow(db, accountId, "ap2"), null);
		const agent = await oneAgent(db, accountId, "marketing");
		assert.equal(agent.tasks, before.tasks);
		assert.equal(agent.lastText, before.lastText);
		assert.equal(agent.tasks, 38);
	});
});

test("approve mission writes no event and sets the mission with zero contribution", async () => {
	await withDemo("mission", async (db, accountId) => {
		const before = await generated(db, accountId);
		await kernel(db).decideMission(scope(accountId), "mp-inventory", true);
		const agent = await oneAgent(db, accountId, "inventory");
		assert.equal(agent.tasks, 31);
		assert.equal(agent.contribution, 0);
		assert.equal(agent.mission, "Never run out of a top-20 product and keep stock under 30 days of cover.");
		assert.deepEqual(agent.targets, [
			["Stock-outs", "—", "0"],
			["Days of stock", "—", "under 30"],
			["Reorders approved in time", "—", "100%"],
		]);
		assert.deepEqual(await generated(db, accountId), before);
		assert.equal(await mandateRow(db, accountId, "mp-inventory"), null);
	});
});

test("a missing rule or a missing limit rolls the Approval back", async () => {
	await withDemo("rollback", async (db, accountId) => {
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
		const orders = await oneAgent(db, accountId, "orders");
		await assert.rejects(() => kernel(db).decide(scope(accountId), "ap-orders", true));
		assert.equal((await oneApproval(db, accountId, "ap-orders"))?.status, "Pending");
		assert.equal((await oneAgent(db, accountId, "orders")).tasks, orders.tasks);
		assert.equal((await generated(db, accountId)).length, 0);
		assert.equal(await mandateRow(db, accountId, "ap-orders"), null);

		await db
			.delete(schema.stateEntries)
			.where(
				and(eq(schema.stateEntries.accountId, accountId), eq(schema.stateEntries.key, "policy.refund_auto_limit")),
			);
		const support = await oneAgent(db, accountId, "support");
		await assert.rejects(() => kernel(db).decide(scope(accountId), "ap1", true));
		assert.equal((await oneApproval(db, accountId, "ap1"))?.status, "Pending");
		assert.equal((await oneAgent(db, accountId, "support")).tasks, support.tasks);
		assert.equal((await generated(db, accountId)).length, 0);
		const listed = await db
			.select()
			.from(schema.rules)
			.where(eq(schema.rules.accountId, accountId))
			.orderBy(asc(schema.rules.sortOrder));
		assert.equal(listed[0]?.id, "r1");
	});
});
