import assert from "node:assert/strict";
import test from "node:test";
import type { PublishedEvent } from "@tensquads/kernel";

import { AccountBus } from "../src/cloudflare-bus/account-bus.ts";
import { BUS_ALARM, clearDeadline, DELIVERY_ALARM, HEARTBEAT_ALARM, setDeadline } from "../src/cloudflare-bus/alarm.ts";
import { finishMaster, MASTER_OPEN } from "../src/cloudflare-bus/master-retry.ts";
import type { PendingBusRow } from "../src/cloudflare-bus/neon-write.ts";
import { Storage } from "./bus-storage.ts";

function event(id: string): PublishedEvent {
	return {
		id,
		from: "master",
		to: "researcher",
		kind: "Task",
		skill: "research",
		text: id,
		payload: {},
		writes: [],
	};
}

function row(id: string, seq: number): PendingBusRow {
	return { seq, event: event(id) };
}

function busFor(storage: Storage, env: ConstructorParameters<typeof AccountBus>[1]): AccountBus {
	return new AccountBus({ storage, acceptWebSocket() {}, getWebSockets: () => [] }, env);
}

class MasterListStorage extends Storage {
	override async list<T>(options?: { prefix?: string }): Promise<Map<string, T>> {
		if (options?.prefix === MASTER_OPEN) throw new Error("The master list failed.");
		return super.list(options);
	}
}

// The async storage cache keeps the value read before external I/O.
// A direct row write is what another request commits while that I/O is in flight.
class CachingStorage extends Storage {
	private readonly cache = new Map<string, unknown>();

	override async get<T>(key: string, options?: { noCache?: boolean }): Promise<T | undefined> {
		if (options?.noCache !== true && this.cache.has(key)) return structuredClone(this.cache.get(key)) as T;
		const value = await super.get<T>(key);
		if (options?.noCache !== true) this.cache.set(key, structuredClone(value));
		return value;
	}

	override async put<T>(key: string, value: T): Promise<void> {
		await super.put(key, value);
		this.cache.set(key, structuredClone(value));
	}

	override async delete(key: string): Promise<boolean> {
		this.cache.delete(key);
		return super.delete(key);
	}
}

test("an idle bus alarm clears when nothing is pending and no master is open", async () => {
	const storage = new Storage();
	await storage.put("account", "acct-idle");
	await storage.put("pending", []);
	await storage.put(BUS_ALARM, 1_000);
	await storage.setAlarm(1_000);
	const bus = busFor(storage, { ADAPTERS: "real", now: () => 1_000 });
	await bus.alarm();
	assert.equal(await storage.get(BUS_ALARM), undefined);
	assert.equal(await storage.getAlarm(), null);
});

test("an open master keeps the bus alarm when nothing is pending", async () => {
	const storage = new Storage();
	await storage.put("account", "acct-open");
	await storage.put("pending", []);
	await storage.put(BUS_ALARM, 1_000);
	await storage.put(`${MASTER_OPEN}evt`, event("evt"));
	await storage.setAlarm(1_000);
	const bus = busFor(storage, { ADAPTERS: "test", now: () => 1_000 });
	await bus.alarm();
	const due = await storage.get<number>(BUS_ALARM);
	assert.equal(typeof due, "number");
	assert.ok(due !== undefined && due > 1_000);
	assert.equal(await storage.getAlarm(), due);
});

test("a retry armed during the drain keeps the delivery deadline", async () => {
	const storage = new Storage();
	let now = 0;
	let again: Promise<Response> | undefined;
	const bus = busFor(storage, {
		ADAPTERS: "real",
		now: () => now,
		retryDeliveries: async () => {
			// The object queue runs this retry after the drain ends.
			again = bus.fetch(
				new Request("https://bus/deliveries/retry", {
					method: "POST",
					body: JSON.stringify({ accountId: "acct-race" }),
				}),
			);
			return 0;
		},
	});
	const armed = await bus.fetch(
		new Request("https://bus/deliveries/retry", {
			method: "POST",
			body: JSON.stringify({ accountId: "acct-race" }),
		}),
	);
	assert.equal(armed.status, 200);
	const due = await storage.get<number>(DELIVERY_ALARM);
	assert.equal(due, 1_000);
	now = 1_000;
	await bus.alarm();
	assert.equal((await again)?.status, 200);
	const kept = await storage.get<number>(DELIVERY_ALARM);
	assert.equal(typeof kept, "number");
	assert.equal(kept, 2_000);
	assert.equal(await storage.getAlarm(), kept);
});

test("a bus alarm does not run a delivery that is not due", async () => {
	const storage = new Storage();
	await storage.put("account", "acct-due");
	await storage.put(BUS_ALARM, 1_000);
	await storage.put(DELIVERY_ALARM, 60_000);
	await storage.setAlarm(1_000);
	let calls = 0;
	const bus = busFor(storage, {
		ADAPTERS: "real",
		now: () => 1_000,
		retryDeliveries: async (_accountId, beforeMs) => {
			if (beforeMs === undefined) calls += 1;
			return 0;
		},
	});
	await bus.alarm();
	assert.equal(calls, 0);
	assert.equal(await storage.get(DELIVERY_ALARM), 60_000);
	assert.equal(await storage.getAlarm(), 60_000);
});

test("a master failure still drains a due delivery and rearms", async () => {
	const storage = new MasterListStorage();
	await storage.put("account", "acct-master");
	await storage.put(BUS_ALARM, 1_000);
	await storage.put(DELIVERY_ALARM, 1_000);
	await storage.setAlarm(1_000);
	let calls = 0;
	const bus = busFor(storage, {
		ADAPTERS: "real",
		now: () => 1_000,
		retryDeliveries: async (_accountId, beforeMs) => {
			if (beforeMs === undefined) calls += 1;
			return 0;
		},
	});
	await bus.alarm();
	assert.equal(calls, 1);
	assert.equal(typeof (await storage.get(BUS_ALARM)), "number");
	assert.notEqual(await storage.getAlarm(), null);
});

function deferred() {
	let resolve = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

test("alarm work and a request never overlap", async () => {
	const storage = new Storage();
	await storage.put("account", "acct-serial");
	await storage.put(BUS_ALARM, 1_000);
	await storage.put(DELIVERY_ALARM, 1_000);
	const entered = deferred();
	const gate = deferred();
	const bus = busFor(storage, {
		ADAPTERS: "real",
		now: () => 1_000,
		retryDeliveries: async (_accountId, beforeMs) => {
			if (beforeMs !== undefined) return 0;
			entered.resolve();
			await gate.promise;
			return 0;
		},
	});
	const alarming = bus.alarm();
	await entered.promise;
	let acceptedDone = false;
	const accepted = bus
		.fetch(
			new Request("https://bus/accept", {
				method: "POST",
				body: JSON.stringify({ accountId: "acct-serial", event: event("serial-event") }),
			}),
		)
		.then((response) => {
			acceptedDone = true;
			return response;
		});
	for (let tick = 0; tick < 5; tick += 1) await new Promise((done) => setImmediate(done));
	assert.equal(acceptedDone, false);
	gate.resolve();
	await alarming;
	assert.equal((await accepted).status, 200);
	assert.equal(acceptedDone, true);
});

test("a timely heartbeat that waits in the queue does not trigger a resume", async () => {
	const storage = new Storage();
	await storage.put("account", "acct-arrival");
	await storage.put("heartbeats", { market: { at: 0 } });
	await storage.put("pending", [row("arrival-one", 1)]);
	await storage.put(BUS_ALARM, 175_000);
	await storage.put(HEARTBEAT_ALARM, 175_000);
	const entered = deferred();
	const gate = deferred();
	let now = 175_000;
	let resumes = 0;
	const bus = busFor(storage, {
		ADAPTERS: "real",
		now: () => now,
		resumeAgent: async () => {
			resumes += 1;
		},
		writeBusPending: async () => {
			entered.resolve();
			await gate.promise;
		},
	});
	const alarming = bus.alarm();
	await entered.promise;
	const heartbeat = bus.fetch(
		new Request("https://bus/heartbeat", {
			method: "POST",
			body: JSON.stringify({ accountId: "acct-arrival", agentId: "market" }),
		}),
	);
	now = 185_000;
	gate.resolve();
	await alarming;
	assert.equal((await heartbeat).status, 200);
	assert.equal(resumes, 0);
});

test("a heartbeat request waits for alarm work", async () => {
	const storage = new Storage();
	await storage.put("account", "acct-heartbeat-serial");
	await storage.put(DELIVERY_ALARM, 1_000);
	const entered = deferred();
	const gate = deferred();
	const bus = busFor(storage, {
		ADAPTERS: "real",
		now: () => 1_000,
		retryDeliveries: async (_accountId, beforeMs) => {
			if (beforeMs !== undefined) return 0;
			entered.resolve();
			await gate.promise;
			return 0;
		},
	});
	const alarming = bus.alarm();
	await entered.promise;
	let heartbeatDone = false;
	const heartbeat = bus
		.fetch(
			new Request("https://bus/heartbeat", {
				method: "POST",
				body: JSON.stringify({ accountId: "acct-heartbeat-serial", agentId: "market" }),
			}),
		)
		.then((response) => {
			heartbeatDone = true;
			return response;
		});
	for (let tick = 0; tick < 5; tick += 1) await new Promise((done) => setImmediate(done));
	assert.equal(heartbeatDone, false);
	gate.resolve();
	await alarming;
	assert.equal((await heartbeat).status, 200);
});

test("an advance uses the injected clock for its deadline", async () => {
	const storage = new Storage();
	const bus = busFor(storage, {
		ADAPTERS: "test",
		now: () => 1_000,
	});
	const response = await bus.fetch(
		new Request("https://bus/advance", {
			method: "POST",
			body: JSON.stringify({
				accountId: "acct-advance-clock",
				deadlineAt: 5_000,
				script: [
					{
						from: "master",
						to: "researcher",
						kind: "Task",
						skill: "research",
						text: "Look.",
						payload: {},
						writes: [],
					},
				],
			}),
		}),
	);
	assert.equal(((await response.json()) as { accepted: boolean }).accepted, true);
});

test("deadline tokens only move forward, so a stale clear keeps the new deadline", async () => {
	const storage = new Storage();
	const first = await setDeadline(storage, DELIVERY_ALARM, 100);
	assert.equal(await clearDeadline(storage, DELIVERY_ALARM, first), true);
	const second = await setDeadline(storage, DELIVERY_ALARM, 200);
	assert.ok(second > first);
	assert.equal(await clearDeadline(storage, DELIVERY_ALARM, first), false);
	assert.equal(await storage.get(DELIVERY_ALARM), 200);
});

test("a failed flush sets its retry from the finish time, not the start time", async () => {
	const storage = new Storage();
	await storage.put("account", "acct-finish");
	await storage.put("pending", [row("pending-one", 1)]);
	await storage.put(BUS_ALARM, 1_000);
	let now = 1_000;
	const bus = busFor(storage, {
		ADAPTERS: "real",
		now: () => now,
		writeBusPending: async () => {
			now = 41_000;
			throw new Error("The database write failed.");
		},
	});
	const response = await bus.fetch(
		new Request("https://bus/accept", {
			method: "POST",
			body: JSON.stringify({ accountId: "acct-finish", event: event("finish-event") }),
		}),
	);
	assert.equal(response.status, 200);
	assert.equal(await storage.get(BUS_ALARM), 71_000);
	assert.equal(await storage.getAlarm(), 71_000);
});

test("a failed master retry uses the injected clock", async () => {
	const storage = new Storage();
	await storage.put("account", "acct-clock");
	await storage.put(`${MASTER_OPEN}clock-event`, event("clock-event"));
	const masterEvent: PublishedEvent = { ...event("clock-event"), to: "master", kind: "Result" };
	await assert.rejects(
		() =>
			finishMaster(storage, { ADAPTERS: "real", now: () => 1_000 }, masterEvent, true, async () => {
				throw new Error("temporary");
			}),
		/temporary/,
	);
	assert.equal(await storage.get(BUS_ALARM), 2_000);
});

test("a flush keeps an event stored while the database write is in flight", async () => {
	const storage = new CachingStorage();
	const bus = busFor(storage, {
		ADAPTERS: "real",
		writeBusPending: async () => {
			const current = (storage.rows.get("pending") as PendingBusRow[] | undefined) ?? [];
			storage.rows.set("pending", [...current, row("early", 2)]);
		},
	});
	const response = await bus.fetch(
		new Request("https://bus/accept", {
			method: "POST",
			body: JSON.stringify({ accountId: "acct-flight", event: event("late") }),
		}),
	);
	assert.equal(response.status, 200);
	const pending = (storage.rows.get("pending") as PendingBusRow[] | undefined) ?? [];
	assert.deepEqual(
		pending.map((item) => item.event.id),
		["early"],
	);
});
