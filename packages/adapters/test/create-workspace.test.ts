import assert from "node:assert/strict";
import test from "node:test";

import { asc } from "drizzle-orm";

import { schema } from "../src/index.ts";
import { createRepositories } from "../src/neon/repositories.ts";
import { openPglite } from "./pglite.ts";

const orders = { id: "orders", name: "Orders", role: "Fulfilment and tracking", tint: "#e7efff" };
const support = { id: "support", name: "Support", role: "Customer inbox and refunds", tint: "#def5ee" };

function draft(clerkUserId: string) {
	return {
		clerkUserId,
		email: "owner@example.com",
		name: "Harbor Coffee",
		mission: "Reach 500 paying customers in year one",
		agents: [orders, support],
	};
}

test("one create makes one account and a repeat does not make a second", async () => {
	const { db, close } = await openPglite();
	try {
		const repositories = createRepositories(db);
		const scope = { accountId: "account-1", mode: "account" as const };
		const first = await repositories.platform.createWorkspace(scope, draft("user_1"));
		assert.equal(first.created, true);
		assert.equal(first.accountId, "account-1");
		const second = await repositories.platform.createWorkspace(
			{ accountId: "account-2", mode: "account" },
			draft("user_1"),
		);
		assert.equal(second.created, false);
		assert.equal(second.accountId, "account-1");
		const accounts = await repositories.platform.listAccounts({ accountId: "platform", mode: "platform" });
		assert.equal(accounts.length, 1);
		assert.equal(accounts[0]?.owner, "owner@example.com");
		assert.equal(accounts[0]?.createdWeek, 7);
		assert.equal(accounts[0]?.lastActive, "Just now");
		assert.equal(accounts[0]?.plan, "Starter");
		assert.equal(accounts[0]?.status, "Trial");
		assert.equal(accounts[0]?.mrr, 0);
		assert.equal(accounts[0]?.squads[0], "Harbor Coffee");
		const agents = await repositories.squads.listAgents({ accountId: "account-1", mode: "account" });
		assert.equal(agents.length, 2);
		assert.equal(
			agents.every((agent) => agent.autonomy === "Ask first" && agent.on),
			true,
		);
		const master = await repositories.squads.master({ accountId: "account-1", mode: "account" });
		assert.equal(master?.name, "Petra");
		assert.equal(agents.find((agent) => agent.id === "orders")?.name, "Pisa");
		assert.equal(agents.find((agent) => agent.id === "support")?.name, "Kyoto");
		const order = await db
			.select({ id: schema.accounts.id, sortOrder: schema.accounts.sortOrder })
			.from(schema.accounts)
			.orderBy(asc(schema.accounts.sortOrder));
		assert.deepEqual(
			order.map((row) => [row.id, row.sortOrder]),
			[["account-1", 0]],
		);
		const store = await repositories.bus.readStore({ accountId: "account-1", mode: "account" });
		assert.equal(store["policy.refund_auto_limit"], 50);
		assert.equal(store["policy.daily_ad_cap"], 200);
		assert.equal(store["policy.reorder_limit"], 500);
	} finally {
		await close();
	}
});

test("a later account sorts after the highest sort order", async () => {
	const { db, close } = await openPglite();
	try {
		const repositories = createRepositories(db);
		await repositories.platform.createWorkspace({ accountId: "account-1", mode: "account" }, draft("user_1"));
		const created = await repositories.platform.createWorkspace(
			{ accountId: "account-2", mode: "account" },
			{
				...draft("user_2"),
				email: "second@example.com",
				name: "Second Coffee",
			},
		);
		assert.equal(created.created, true);
		assert.equal(created.accountId, "account-2");
		const order = await db
			.select({ id: schema.accounts.id, sortOrder: schema.accounts.sortOrder })
			.from(schema.accounts)
			.orderBy(asc(schema.accounts.sortOrder));
		assert.deepEqual(
			order.map((row) => [row.id, Number(row.sortOrder)]),
			[
				["account-1", 0],
				["account-2", 1],
			],
		);
		const accounts = await repositories.platform.listAccounts({ accountId: "platform", mode: "platform" });
		assert.deepEqual(
			accounts.map((account) => account.id),
			["account-1", "account-2"],
		);
	} finally {
		await close();
	}
});

// Sign-up in real mode creates the account before any Durable Object exists.
test("a new workspace can be created in real mode", async () => {
	const { db, close } = await openPglite();
	const before = process.env.ADAPTERS;
	process.env.ADAPTERS = "real";
	try {
		const repositories = createRepositories(db);
		const made = await repositories.platform.createWorkspace(
			{ accountId: "account-real", mode: "account" },
			draft("user_real"),
		);
		assert.equal(made.created, true);
		assert.equal(made.accountId, "account-real");
	} finally {
		if (before === undefined) delete process.env.ADAPTERS;
		else process.env.ADAPTERS = before;
		await close();
	}
});
