import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "@neondatabase/serverless";
import type { PublishedEvent } from "@tensquads/kernel";
import { AccountBus, type BusStorage } from "../src/cloudflare-bus/account-bus.ts";
import { createCloudflareBus, handleBusQueue, handleMachineRequest } from "../src/cloudflare-bus/http.ts";
import { writePending } from "../src/cloudflare-bus/neon-write.ts";
import { signMachineToken } from "../src/cloudflare-bus/token.ts";
import { workerTestBus } from "../src/worker-adapters.ts";
import { openPglite } from "./pglite.ts";

const scope = { accountId: "bus-recovery", mode: "account" } as const;
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

class Storage implements BusStorage {
	rows = new Map<string, unknown>();
	alarm: number | null = null;
	private tail = Promise.resolve();
	async get<T>(key: string): Promise<T | undefined> {
		return structuredClone(this.rows.get(key)) as T | undefined;
	}
	async put<T>(key: string, value: T): Promise<void> {
		this.rows.set(key, structuredClone(value));
	}
	async list<T>({ prefix = "" } = {}): Promise<Map<string, T>> {
		return new Map([...this.rows].filter(([key]) => key.startsWith(prefix))) as Map<string, T>;
	}
	transaction<T>(closure: (txn: BusStorage) => Promise<T>): Promise<T> {
		const next = this.tail.then(async () => {
			const before = structuredClone(this.rows);
			const alarm = this.alarm;
			try {
				return await closure(this);
			} catch (error) {
				this.rows = before;
				this.alarm = alarm;
				throw error;
			}
		});
		this.tail = next.then(
			() => undefined,
			() => undefined,
		);
		return next;
	}
	async setAlarm(time: number | Date): Promise<void> {
		this.alarm = Number(time);
	}
	async getAlarm(): Promise<number | null> {
		return this.alarm;
	}
	async deleteAlarm(): Promise<void> {
		this.alarm = null;
	}
}

function bus(storage: Storage, database?: string) {
	return new AccountBus({ storage, acceptWebSocket() {}, getWebSockets: () => [] }, { DATABASE_URL: database });
}

function accept(target: AccountBus, body: unknown) {
	return target.fetch(new Request("https://bus/accept", { method: "POST", body: JSON.stringify(body) }));
}

const malformed: unknown[] = [
	null,
	{},
	{ accountId: 1, event },
	{ accountId: "", event },
	...["id", "from", "to", "kind", "skill", "text"].flatMap((key) =>
		["", 1, null].map((value) => ({ accountId: scope.accountId, event: { ...event, [key]: value } })),
	),
	...["payload", "set"].flatMap((key) =>
		[[], null, "value"].map((value) => ({ accountId: scope.accountId, event: { ...event, [key]: value } })),
	),
	...[{}, null, "key", [1]].map((writes) => ({ accountId: scope.accountId, event: { ...event, writes } })),
	...["time", "trace"].map((key) => ({ accountId: scope.accountId, event: { ...event, [key]: 1 } })),
];

test("invalid records never reach durable storage or queue acknowledgement", async () => {
	const storage = new Storage();
	const target = bus(storage);
	for (const body of malformed) {
		const response = await accept(target, body);
		assert.equal(response.status, 400);
		let acknowledged = false;
		await assert.rejects(
			handleBusQueue(
				{
					queue: "tensquads-bus",
					messages: [
						{
							id: "bad",
							body,
							ack() {
								acknowledged = true;
							},
						},
					],
				},
				{},
			),
		);
		assert.equal(acknowledged, false);
	}
	assert.equal(storage.rows.size, 0);
	assert.equal(storage.alarm, null);
	assert.deepEqual(await workerTestBus().events(scope), []);
});

test("signed machine sends reject malformed records and envelopes", async () => {
	const key = "recovery-key";
	const token = await signMachineToken(key, scope.accountId, "researcher", Math.floor(Date.now() / 1000) + 60);
	for (const body of [...malformed, { accountId: scope.accountId, agentId: [], event }]) {
		const record = body && typeof body === "object" ? { agentId: "researcher", ...body } : body;
		const response = await handleMachineRequest(
			new Request("https://worker/machine/send", {
				method: "POST",
				headers: { authorization: `Bearer ${token}` },
				body: JSON.stringify(record),
			}),
			{ MACHINE_TOKEN_KEY: key },
		);
		assert.equal(response?.status, 400);
		assert.equal(await response?.text(), "The message was rejected.");
	}
	assert.deepEqual(await workerTestBus().events(scope), []);
});

test("rejected queue messages still become one dead-letter escalation", async () => {
	for (let index = 0; index < 2; index += 1) {
		let acknowledged = false;
		await handleBusQueue(
			{
				queue: "tensquads-bus-dlq",
				messages: [
					{
						id: "rejected",
						body: { accountId: scope.accountId, event: { writes: {} } },
						ack() {
							acknowledged = true;
						},
					},
				],
			},
			{},
		);
		assert.equal(acknowledged, true);
	}
	const events = await workerTestBus().events(scope);
	assert.deepEqual(
		events.map(({ id, kind }) => ({ id, kind })),
		[{ id: "dead-rejected", kind: "Escalation" }],
	);
});

test("simulation resumes stored steps, serializes calls, and retries the failed step", async () => {
	const stored: PublishedEvent[] = [];
	let refuse = false;
	const namespace = {
		idFromName: (id: string) => id,
		get: () => ({
			async fetch(input: Request | string | URL, init?: RequestInit) {
				if (String(input).endsWith("/events")) return Response.json(stored);
				if (refuse) return new Response("unavailable", { status: 503 });
				const body = JSON.parse(String(init?.body)) as { event: PublishedEvent };
				if (!stored.some(({ id }) => id === body.event.id)) stored.push(body.event);
				return Response.json({ seen: false });
			},
		}),
	};
	const script = [
		{ ...event, text: "First" },
		{ ...event, text: "Second" },
	];
	const first = createCloudflareBus(namespace, script);
	assert.equal((await first.nextEvent(scope))?.id, "e100");
	const recreated = createCloudflareBus(namespace, script);
	const next = await recreated.nextEvent(scope);
	assert.equal(next?.id, "e101");
	assert.equal(next?.text, "Second");
	assert.equal(next?.time, "11:04");
	assert.deepEqual(
		(await Promise.all([recreated.nextEvent(scope), recreated.nextEvent(scope)])).map((row) => row?.id),
		["e102", "e103"],
	);
	refuse = true;
	await assert.rejects(recreated.nextEvent(scope));
	refuse = false;
	assert.equal((await recreated.nextEvent(scope))?.id, "e104");
	assert.equal(stored.length, 5);
});

test("pending writes recover in order and commit batches atomically", async (t) => {
	const database = await openPglite();
	const storage = new Storage();
	const entered = deferred();
	const release = deferred();
	let active = 0;
	let maximum = 0;
	let connections = 0;
	let refuse = false;
	t.mock.method(Pool.prototype, "connect", async () => {
		connections += 1;
		active += 1;
		maximum = Math.max(maximum, active);
		if (connections === 1) {
			assert.equal((await storage.get<unknown[]>("pending"))?.length, 1);
			assert.equal(typeof storage.alarm, "number");
			entered.resolve();
			await release.promise;
		}
		return {
			async query(config: { text: string }, params: unknown[]) {
				if (refuse && params?.length > 0) throw new Error("Database refused.");
				return database.client.query(config.text, params);
			},
			release() {
				active -= 1;
			},
		};
	});
	try {
		await database.client.query(
			`INSERT INTO accounts (id, account_id, name, owner, email, tint, agents, online, tasks, last_active, created_week, mission, sort_order) VALUES ($1, $1, '', '', '', '', 0, 0, 0, '', 0, '', 0)`,
			[scope.accountId],
		);
		const target = bus(storage, "postgres://fixture/db");
		const first = accept(target, {
			accountId: scope.accountId,
			event: { ...event, id: "first", set: { status: 1 } },
		});
		await entered.promise;
		const alarm = target.alarm();
		const second = accept(target, {
			accountId: scope.accountId,
			event: { ...event, id: "second", set: { status: 2 } },
		});
		await storage.transaction(async () => {});
		release.resolve();
		assert.equal((await first).status, 200);
		assert.equal((await second).status, 200);
		await alarm;
		assert.equal(maximum, 1);
		assert.equal(storage.alarm, null);
		assert.deepEqual(await storage.get("pending"), []);
		assert.deepEqual((await database.client.query("SELECT value FROM state_entries")).rows, [{ value: "2" }]);
		refuse = true;
		await accept(target, { accountId: scope.accountId, event: { ...event, id: "recover" } });
		assert.equal(typeof storage.alarm, "number");
		const beforeRetry = connections;
		refuse = false;
		const repeat = await accept(bus(storage, "postgres://fixture/db"), {
			accountId: scope.accountId,
			event: { ...event, id: "recover" },
		});
		assert.equal(((await repeat.json()) as { seen: boolean }).seen, true);
		assert.equal(connections, beforeRetry + 1);
		assert.deepEqual(await storage.get("pending"), []);
		assert.equal(storage.alarm, null);
		await assert.rejects(
			writePending("postgres://fixture/db", scope.accountId, [
				{ seq: 4, event: { ...event, id: "rollback-first", set: { status: 4 } } },
				{ seq: 5, event: { ...event, id: "rollback-second", set: { invalid: 1n } } },
			]),
		);
		assert.deepEqual((await database.client.query("SELECT id FROM bus_events ORDER BY seq")).rows, [
			{ id: "first" },
			{ id: "second" },
			{ id: "recover" },
		]);
		assert.deepEqual((await database.client.query("SELECT value FROM state_entries")).rows, [{ value: "2" }]);
	} finally {
		release.resolve();
		await database.close();
	}
});

test("machine sends bind the sender in both adapter modes and preserve queue senders", async () => {
	const machineScope = { accountId: "sender-boundary", mode: "account" } as const;
	const key = "sender-key";
	const token = await signMachineToken(key, machineScope.accountId, "researcher", Math.floor(Date.now() / 1000) + 60);
	for (const mode of ["test", "real"]) {
		const storage = new Storage();
		const target = bus(storage);
		const namespace = {
			idFromName: (id: string) => id,
			get: () => ({
				fetch: (input: Request | string | URL, init?: RequestInit) => target.fetch(new Request(input, init)),
			}),
		};
		const env = { ADAPTERS: mode, ACCOUNT_BUS: namespace, MACHINE_TOKEN_KEY: key };
		async function send(from: string) {
			return handleMachineRequest(
				new Request("https://worker/machine/send", {
					method: "POST",
					headers: { authorization: `Bearer ${token}` },
					body: JSON.stringify({
						accountId: machineScope.accountId,
						agentId: "researcher",
						event: {
							...event,
							id: `${mode}-${from}`,
							from,
							kind: "Approval",
							set: { "policy.refund_auto_limit": 999999 },
						},
					}),
				}),
				env,
			);
		}
		for (const from of ["master", "bus"]) {
			const rejected = await send(from);
			assert.equal(rejected?.status, 401);
			assert.equal(await rejected?.text(), "The token was rejected.");
		}
		assert.equal(storage.rows.size, 0);
		assert.equal((await send("researcher"))?.status, 200);
		await handleBusQueue(
			{
				queue: "tensquads-bus",
				messages: [
					{
						id: "queue-bus",
						body: { accountId: machineScope.accountId, event: { ...event, id: "queue-bus", from: "bus" } },
						ack() {},
					},
				],
			},
			env,
		);
		if (mode === "real") {
			assert.equal((await storage.get<PublishedEvent>("event:1"))?.from, "researcher");
			assert.equal((await storage.get<PublishedEvent>("event:2"))?.from, "bus");
			assert.equal(await storage.get("state:policy.refund_auto_limit"), "999999");
		} else {
			assert.deepEqual(
				(await workerTestBus().events(machineScope)).map(({ from }) => from),
				["researcher", "bus"],
			);
		}
	}
});

test("inspection routes require the exact test binding and store stays available", async () => {
	const storage = new Storage();
	await accept(bus(storage), { accountId: scope.accountId, event });
	for (const inspect of [undefined, "0", "true", "1"]) {
		const target = new AccountBus(
			{ storage, acceptWebSocket() {}, getWebSockets: () => [] },
			{ BUS_INSPECT: inspect },
		);
		for (const path of ["/seq", "/alarm", "/local-store", "/local-events"]) {
			const response = await target.fetch(new Request(`https://bus${path}`));
			assert.equal(response.status, inspect === "1" ? 200 : 404);
			if (inspect === "1" && path === "/local-events") assert.deepEqual(await response.json(), [event]);
		}
		assert.equal((await target.fetch(new Request("https://bus/store"))).status, 200);
	}
});

test("a pending duplicate is not a new simulation step and does not advance the cursor", async (t) => {
	const storage = new Storage();
	t.mock.method(Pool.prototype, "connect", async () => {
		throw new Error("Database refused.");
	});
	const target = bus(storage, "postgres://fixture/db");
	let visible = false;
	const namespace = {
		idFromName: (id: string) => id,
		get: () => ({
			async fetch(input: Request | string | URL, init?: RequestInit) {
				if (String(input).endsWith("/events")) {
					return Response.json(
						visible ? [...(await storage.list<PublishedEvent>({ prefix: "event:" })).values()] : [],
					);
				}
				return target.fetch(new Request(input, init));
			},
		}),
	};
	const script = [
		{ ...event, text: "First" },
		{ ...event, text: "Second" },
	];
	const first = createCloudflareBus(namespace, script);
	const recreated = createCloudflareBus(namespace, script);
	const results = await Promise.all([first.nextEvent(scope), recreated.nextEvent(scope)]);
	assert.deepEqual(
		results.filter(Boolean).map((row) => row?.id),
		["e100"],
	);
	assert.equal(results.filter((row) => row === undefined).length, 1);
	assert.equal(await recreated.nextEvent(scope), undefined);
	assert.equal(await storage.get("seq"), 1);
	assert.equal(typeof storage.alarm, "number");
	visible = true;
	const next = await recreated.nextEvent(scope);
	assert.equal(next?.id, "e101");
	assert.equal(next?.text, "Second");
	assert.equal(next?.time, "11:04");
	assert.equal(await storage.get("seq"), 2);
});
