import assert from "node:assert/strict";
import test from "node:test";
import type { AppDatabase } from "@tensquads/adapters";
import { and, eq } from "drizzle-orm";

import { replaceDemoAccount } from "../../seed/src/demo-account.ts";
import { AccountBus } from "../src/cloudflare-bus/account-bus.ts";
import {
	BUS_ALARM,
	clearDeadline,
	DELIVERY_ALARM,
	HEARTBEAT_ALARM,
	rearm,
	setDeadline,
} from "../src/cloudflare-bus/alarm.ts";
import { sweepDeliveryRetries } from "../src/cloudflare-bus/delivery-sweep.ts";
import {
	type DeliverUserEvent,
	scheduleDeliveryRetry,
	type UserMasterEvent,
} from "../src/neon/commands/approval-bus.ts";
import { deliveryBackoffMs, retryApprovalDeliveries } from "../src/neon/commands/approval-delivery.ts";
import { decide } from "../src/neon/commands/approvals.ts";
import { schema } from "../src/neon/schema.ts";
import { Storage } from "./bus-storage.ts";
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
		await decide(db, scope(accountId), "m-01", true, undefined, deliver, undefined, "clerk-ask");
		assert.equal(await status(db, accountId, "m-01"), "Approved");
		assert.equal(delivered.length, 1);
		assert.equal(delivered[0]?.id, "user-m-01");
		assert.equal(delivered[0]?.skill, "brief.write");
		assert.equal(delivered[0]?.kind, "Approval");
		const mandates = await db
			.select({
				id: schema.mandates.approvalId,
				skill: schema.mandates.skill,
				saidYes: schema.mandates.saidYes,
				taskId: schema.mandates.taskId,
			})
			.from(schema.mandates)
			.where(eqAccount(accountId));
		assert.equal(mandates.length, 1);
		assert.equal(mandates[0]?.skill, "website.build");
		assert.equal(mandates[0]?.saidYes, "clerk-ask");
		assert.equal(mandates[0]?.taskId, "m-01");
		assert.equal((await deliveries(db, accountId)).length, 0);
		await decide(db, scope(accountId), "m-01", true, undefined, deliver, undefined, "clerk-ask");
		assert.equal(delivered.length, 1);
	});
});

test("the alarm trigger retries a failed send exactly once, with no decide call", async () => {
	await withDemo("alarm", async (db, accountId) => {
		const received: string[] = [];
		let calls = 0;
		const deliver: DeliverUserEvent = async (_accountId, event) => {
			calls += 1;
			if (calls === 1) throw new Error("The bus write failed.");
			if (!received.includes(event.id)) received.push(event.id);
		};
		await assert.rejects(() => decide(db, scope(accountId), "ap1", true, undefined, deliver));
		assert.equal(await status(db, accountId, "ap1"), "Approved");
		assert.equal((await deliveries(db, accountId)).length, 1);
		assert.equal(received.length, 0);

		const storage = new Storage();
		await storage.put("account", accountId);
		await storage.put(DELIVERY_ALARM, 0);
		const bus = new AccountBus(
			{ storage, acceptWebSocket() {}, getWebSockets: () => [] },
			{
				ADAPTERS: "real",
				retryDeliveries: (id) => retryApprovalDeliveries(db, id, deliver),
			},
		);
		await bus.alarm();
		assert.equal(calls, 2);
		assert.deepEqual(received, ["user-ap1"]);
		assert.equal((await deliveries(db, accountId)).length, 0);

		await bus.alarm();
		assert.equal(calls, 2);
		assert.deepEqual(received, ["user-ap1"]);
	});
});

test("a drain that still has rows arms the alarm with a growing backoff", async () => {
	const storage = new Storage();
	await storage.put("account", "acct-backoff");
	let calls = 0;
	const bus = new AccountBus(
		{ storage, acceptWebSocket() {}, getWebSockets: () => [] },
		{
			ADAPTERS: "real",
			now: () => 10_000,
			retryDeliveries: async (_id, beforeMs) => {
				if (beforeMs === undefined) calls += 1;
				return 1;
			},
		},
	);
	await storage.put(DELIVERY_ALARM, 10_000);
	await bus.alarm();
	assert.equal(calls, 1);
	assert.equal(storage.alarm, 11_000);
	assert.equal(await storage.get("delivery-attempt"), 1);
	await storage.put(DELIVERY_ALARM, 10_000);
	await bus.alarm();
	assert.equal(calls, 2);
	assert.equal(storage.alarm, 12_000);
	assert.equal(await storage.get("delivery-attempt"), 2);
});

test("a test-mode alarm does not drain deliveries", async () => {
	const storage = new Storage();
	await storage.put("account", "acct-test");
	let calls = 0;
	const bus = new AccountBus(
		{ storage, acceptWebSocket() {}, getWebSockets: () => [] },
		{
			ADAPTERS: "test",
			retryDeliveries: async () => {
				calls += 1;
				return 0;
			},
		},
	);
	await bus.alarm();
	assert.equal(calls, 0);
});

test("a failed send asks the account bus to schedule the retry", async () => {
	await withDemo("schedule", async (db, accountId) => {
		const scheduled: string[] = [];
		const deliver: DeliverUserEvent = async () => {
			throw new Error("The bus write failed.");
		};
		await assert.rejects(() =>
			decide(db, scope(accountId), "ap1", true, undefined, deliver, async (id) => {
				scheduled.push(id);
			}),
		);
		assert.deepEqual(scheduled, [accountId]);
		assert.equal((await deliveries(db, accountId)).length, 1);
	});
});

test("a non-ok schedule answer is a failure, not a success", async () => {
	const namespace = {
		idFromName: (name: string) => name,
		get: () => ({ fetch: async () => new Response("no", { status: 503 }) }),
	};
	const previous = process.env.ADAPTERS;
	process.env.ADAPTERS = "real";
	try {
		await assert.rejects(() => scheduleDeliveryRetry("acct-503", namespace));
	} finally {
		if (previous === undefined) delete process.env.ADAPTERS;
		else process.env.ADAPTERS = previous;
	}
});

test("an unrelated bus flush keeps the armed delivery deadline", async () => {
	const storage = new Storage();
	const bus = new AccountBus(
		{ storage, acceptWebSocket() {}, getWebSockets: () => [] },
		{ ADAPTERS: "real", retryDeliveries: async () => 0 },
	);
	const armed = await bus.fetch(
		new Request("https://bus/deliveries/retry", {
			method: "POST",
			body: JSON.stringify({ accountId: "acct-flush" }),
		}),
	);
	assert.equal(armed.ok, true);
	const due = await storage.get<number>(DELIVERY_ALARM);
	assert.equal(typeof due, "number");
	assert.equal(storage.alarm, due);

	const accepted = await bus.fetch(
		new Request("https://bus/accept", {
			method: "POST",
			body: JSON.stringify({
				accountId: "acct-flush",
				event: {
					id: "e-other",
					from: "master",
					to: "market",
					kind: "Task",
					skill: "web.search",
					text: "Done.",
					payload: {},
					writes: [],
				},
			}),
		}),
	);
	assert.equal(accepted.ok, true);
	assert.equal(await storage.get(DELIVERY_ALARM), due);
	assert.equal(storage.alarm, due);
	assert.equal(await storage.get("delivery-attempt"), 0);
});

test("rearm picks the earliest of the three deadlines, in any order", async () => {
	const keys = [BUS_ALARM, HEARTBEAT_ALARM, DELIVERY_ALARM];
	const values = [30_000, 5_000, 12_345];
	for (let shift = 0; shift < 3; shift += 1) {
		const storage = new Storage();
		for (let index = 0; index < 3; index += 1) {
			await storage.put(keys[index] as string, values[(index + shift) % 3] as number);
		}
		await rearm(storage);
		assert.equal(storage.alarm, 5_000);
	}
	for (const key of keys) {
		const storage = new Storage();
		await storage.put(key, 7_500);
		await rearm(storage);
		assert.equal(storage.alarm, 7_500);
	}
	const storage = new Storage();
	await setDeadline(storage, BUS_ALARM, 30_000);
	await setDeadline(storage, HEARTBEAT_ALARM, 5_000);
	await setDeadline(storage, DELIVERY_ALARM, 12_345);
	assert.equal(storage.alarm, 5_000);
	await clearDeadline(storage, HEARTBEAT_ALARM);
	assert.equal(storage.alarm, 12_345);
	await clearDeadline(storage, DELIVERY_ALARM);
	assert.equal(storage.alarm, 30_000);
	await clearDeadline(storage, BUS_ALARM);
	assert.equal(storage.alarm, null);
});

test("a completed bus flush keeps the armed delivery deadline", async () => {
	const storage = new Storage();
	const bus = new AccountBus(
		{ storage, acceptWebSocket() {}, getWebSockets: () => [] },
		{ ADAPTERS: "real", retryDeliveries: async () => 0, writeBusPending: async () => undefined },
	);
	const armed = await bus.fetch(
		new Request("https://bus/deliveries/retry", {
			method: "POST",
			body: JSON.stringify({ accountId: "acct-done" }),
		}),
	);
	assert.equal(armed.ok, true);
	const due = await storage.get<number>(DELIVERY_ALARM);
	const accepted = await bus.fetch(
		new Request("https://bus/accept", {
			method: "POST",
			body: JSON.stringify({
				accountId: "acct-done",
				event: {
					id: "e-done",
					from: "master",
					to: "market",
					kind: "Task",
					skill: "web.search",
					text: "Done.",
					payload: {},
					writes: [],
				},
			}),
		}),
	);
	assert.equal(accepted.ok, true);
	assert.deepEqual(await storage.get("pending"), []);
	assert.equal(await storage.get(DELIVERY_ALARM), due);
	assert.equal(storage.alarm, due);
});

test("a delivery drain keeps the bus alarm while bus writes are pending", async () => {
	const storage = new Storage();
	await storage.put("account", "acct-bus");
	await storage.put("pending", [
		{
			seq: 1,
			event: {
				id: "e-bus",
				from: "master",
				to: "market",
				kind: "Task",
				skill: "web.search",
				text: "Wait.",
				payload: {},
				writes: [],
			},
		},
	]);
	await storage.put(BUS_ALARM, 0);
	const bus = new AccountBus(
		{ storage, acceptWebSocket() {}, getWebSockets: () => [] },
		{ ADAPTERS: "real", retryDeliveries: async () => 0 },
	);
	await bus.alarm();
	assert.equal(((await storage.get<readonly unknown[]>("pending")) ?? []).length, 1);
	assert.notEqual(storage.alarm, null);
});

test("a 503 schedule leaves the row, and the sweep recovers it through the alarm", async () => {
	await withDemo("sweep", async (db, accountId) => {
		const received: string[] = [];
		let calls = 0;
		const deliver: DeliverUserEvent = async (_accountId, event) => {
			calls += 1;
			if (calls === 1) throw new Error("The bus write failed.");
			if (!received.includes(event.id)) received.push(event.id);
		};
		const failingNamespace = {
			idFromName: (name: string) => name,
			get: () => ({ fetch: async () => new Response("no", { status: 503 }) }),
		};
		await assert.rejects(() =>
			decide(db, scope(accountId), "ap1", true, undefined, deliver, (id) =>
				scheduleDeliveryRetry(id, failingNamespace),
			),
		);
		assert.equal(calls, 1);
		assert.equal((await deliveries(db, accountId)).length, 1);

		const storage = new Storage();
		await storage.put("account", accountId);
		const bus = new AccountBus(
			{ storage, acceptWebSocket() {}, getWebSockets: () => [] },
			{ ADAPTERS: "real", retryDeliveries: (id) => retryApprovalDeliveries(db, id, deliver) },
		);
		const busNamespace = {
			idFromName: (name: string) => name,
			get: () => ({
				fetch: (input: Request | string | URL, init?: RequestInit) => bus.fetch(new Request(input, init)),
			}),
		};
		const poked = await sweepDeliveryRetries(
			{ ADAPTERS: "real", ACCOUNT_BUS: busNamespace },
			Date.now(),
			async () => [accountId],
		);
		assert.deepEqual(poked, [accountId]);
		await storage.put(DELIVERY_ALARM, Date.now());
		await bus.alarm();
		assert.equal(calls, 2);
		assert.deepEqual(received, ["user-ap1"]);
		assert.equal((await deliveries(db, accountId)).length, 0);
	});
});

test("the delivery backoff is bounded", () => {
	assert.equal(deliveryBackoffMs(0), 1_000);
	assert.equal(deliveryBackoffMs(1), 2_000);
	assert.equal(deliveryBackoffMs(2), 4_000);
	assert.equal(deliveryBackoffMs(100), 60_000);
});

function eqAccount(accountId: string) {
	return eq(schema.mandates.accountId, accountId);
}
