import assert from "node:assert/strict";
import test from "node:test";
import { type AppDatabase, createRepositories, masterStartEvent, schema } from "@tensquads/adapters";
import { Kernel, noAgentReply, storedResearchReply } from "@tensquads/kernel";
import { eq } from "drizzle-orm";

import { replaceDemoAccount } from "../../seed/src/demo-account.ts";
import { openPglite } from "./pglite.ts";

const restaurant = `restaurant: Proof Kitchen
cuisine: Levantine
Chicken tawook | 14 | Mains`;
const ads = "How did ads do this week?";

function scope(accountId: string) {
	return { accountId, mode: "account" as const };
}

async function withCopy(name: string, run: (db: AppDatabase, accountId: string) => Promise<void>) {
	const { db, close } = await openPglite();
	const accountId = `live-${name}`;
	try {
		await replaceDemoAccount(db, accountId, `clerk-${name}`);
		await run(db, accountId);
	} finally {
		await close();
	}
}

async function messageCount(db: AppDatabase, accountId: string): Promise<number> {
	const rows = await db.select().from(schema.messages).where(eq(schema.messages.accountId, accountId));
	return rows.length;
}

test("a real-run restaurant starts research before the chat writes a result", async () => {
	await withCopy("restaurant", async (db, accountId) => {
		const before = await messageCount(db, accountId);
		let calls = 0;
		let during = -1;
		const kernel = new Kernel(createRepositories(db), {
			liveStart: async (_scope, request) => {
				calls += 1;
				during = await messageCount(db, accountId);
				assert.equal(request.businessName, "Proof Kitchen");
				assert.equal(request.businessType, "restaurant");
				assert.equal(request.cuisine, "Levantine");
			},
		});
		const beforeEvents = await db.select().from(schema.busEvents).where(eq(schema.busEvents.accountId, accountId));
		const beforeResults = beforeEvents.filter((row) => row.kind === "Result").length;
		const started = await kernel.beginSend(scope(accountId), restaurant);
		assert.equal(calls, 1);
		assert.equal(during, before);
		assert.equal(started.kind, "answered");
		if (started.kind !== "answered") return;
		assert.equal(started.messages.at(-1)?.text, storedResearchReply());
		const events = await db.select().from(schema.busEvents).where(eq(schema.busEvents.accountId, accountId));
		assert.equal(events.filter((row) => row.kind === "Result").length, beforeResults);
	});
});

test("test mode still answers a restaurant line without a live start", async () => {
	await withCopy("test-mode", async (db, accountId) => {
		const started = await new Kernel(createRepositories(db)).beginSend(scope(accountId), restaurant);
		assert.equal(started.kind, "answered");
		if (started.kind !== "answered") return;
		assert.equal(started.messages.at(-1)?.text, noAgentReply());
	});
});

test("a live start still hands an ads question to the marketing agent", async () => {
	await withCopy("ads", async (db, accountId) => {
		let calls = 0;
		const kernel = new Kernel(createRepositories(db), {
			liveStart: async () => {
				calls += 1;
			},
		});
		const started = await kernel.beginSend(scope(accountId), ads);
		assert.equal(calls, 0);
		assert.equal(started.kind, "working");
	});
});

test("a real start calls provisionAgents once and a failure stops the run", async () => {
	const request = {
		businessName: "Proof Kitchen",
		businessType: "restaurant" as const,
		cuisine: "Levantine",
		items: [{ name: "Chicken tawook", price: "14", section: "Mains" }],
	};
	let calls = 0;
	let seenAccount = "";
	let seenExp: Record<string, number> | undefined;
	const event = await masterStartEvent(
		{
			ADAPTERS: "real",
			provisionAgents: async (_env, accountId, _nowMs, currentExp) => {
				calls += 1;
				seenAccount = accountId;
				seenExp = { ...currentExp };
				return [{ agentId: "market", rotated: false, exp: currentExp.market ?? 0, profile: "", snapshot: "" }];
			},
		},
		"acct-real",
		request,
		{ machineExp: { market: 9999 } },
		10,
	);
	assert.equal(calls, 1);
	assert.equal(seenAccount, "acct-real");
	assert.deepEqual(seenExp, { market: 9999 });
	assert.equal(event.kind, "Task");

	await withCopy("provision-fail", async (db, accountId) => {
		const kernel = new Kernel(createRepositories(db), {
			liveStart: async () => {
				throw new Error("The token is missing.");
			},
		});
		const before = await db.select().from(schema.busEvents).where(eq(schema.busEvents.accountId, accountId));
		const beforeTasks = before.filter((row) => row.kind === "Task").length;
		const started = await kernel.beginSend(scope(accountId), restaurant);
		assert.equal(started.kind, "answered");
		if (started.kind !== "answered") return;
		assert.equal(started.messages.at(-1)?.text, "The machines did not start.");
		assert.equal(
			started.messages.some((message) => message.text === restaurant),
			true,
		);
		const events = await db.select().from(schema.busEvents).where(eq(schema.busEvents.accountId, accountId));
		assert.equal(events.filter((row) => row.kind === "Task").length, beforeTasks);
	});
});

test("the start event keeps the stored machine expiry map", async () => {
	const request = {
		businessName: "Proof Kitchen",
		businessType: "restaurant" as const,
		cuisine: "Levantine",
		items: [{ name: "Chicken tawook", price: "14", section: "Mains" }],
	};
	const event = await masterStartEvent({ ADAPTERS: "test" }, "proof", request, { machineExp: { market: 9999 } }, 10);
	assert.equal(event.kind, "Task");
	assert.equal(event.id, "business-proof");
	assert.deepEqual(event.set?.business, request);
	assert.deepEqual(event.set?.machineExp, { market: 9999, website: 0 });
	const empty = await masterStartEvent({}, "proof", request, {}, 10);
	assert.deepEqual(empty.set?.machineExp, { market: 0, website: 0 });
	await assert.rejects(
		() => masterStartEvent({ ADAPTERS: "real" }, "proof", request, { machineExp: { market: 9999 } }, 10),
		/The machine service is not configured\./,
	);
});
