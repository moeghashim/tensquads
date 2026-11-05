import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "@neondatabase/serverless";
import type { PublishedEvent } from "@tensquads/kernel";
import { AccountBus } from "../src/cloudflare-bus/account-bus.ts";
import { createCloudflareBus, handleBusQueue, handleMachineRequest } from "../src/cloudflare-bus/http.ts";
import { writePending } from "../src/cloudflare-bus/neon-write.ts";
import { signMachineToken } from "../src/cloudflare-bus/token.ts";
import type { ScriptedBusEvent } from "../src/memory-bus.ts";
import { busEvents } from "../src/neon/schema.ts";
import { workerTestBus } from "../src/worker-adapters.ts";
import { Storage } from "./bus-storage.ts";
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

const script: ScriptedBusEvent[] = ["First", "Second"].map((text) => ({
	from: event.from,
	to: event.to,
	kind: "Task",
	skill: event.skill,
	text,
	payload: event.payload,
	writes: event.writes,
}));

function deferred() {
	let resolve = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function bus(storage: Storage, database?: string) {
	return new AccountBus({ storage, acceptWebSocket() {}, getWebSockets: () => [] }, { DATABASE_URL: database });
}

function accept(target: AccountBus, body: unknown) {
	return target.fetch(new Request("https://bus/accept", { method: "POST", body: JSON.stringify(body) }));
}

test("scoped reads see seeded Neon history before the first accept", async (t) => {
	const database = await openPglite();
	const storage = new Storage();
	const target = bus(storage, "postgres://fixture/db");
	const published: PublishedEvent[] = [];
	t.mock.method(Pool.prototype, "query", async (config: { text: string; rowMode?: string }, params: unknown[]) => {
		const result = await database.client.query<Record<string, unknown>>(config.text, params);
		const rows = config.rowMode === "array" ? result.rows.map((row) => Object.values(row)) : result.rows;
		return { ...result, rows };
	});
	const namespace = {
		idFromName: (id: string) => id,
		get: () => ({
			async fetch(input: Request | string | URL, init?: RequestInit) {
				const request = new Request(input, init);
				if (new URL(request.url).pathname === "/accept") {
					published.push(((await request.json()) as { event: PublishedEvent }).event);
					return Response.json({ seen: false });
				}
				return target.fetch(request);
			},
		}),
	};
	try {
		for (const accountId of [scope.accountId, "other-account"]) {
			await database.client.query(
				`INSERT INTO accounts (id, account_id, name, owner, email, tint, agents, online, tasks, last_active, created_week, mission, sort_order) VALUES ($1, $1, '', '', '', '', 0, 0, 0, '', 0, '', 0)`,
				[accountId],
			);
		}
		await database.db.insert(busEvents).values(
			[
				{ accountId: scope.accountId, id: "e100", seq: 2, timeText: "00:01" },
				{ accountId: scope.accountId, id: "seed", seq: 1, timeText: "23:59" },
				{ accountId: "other-account", id: "foreign", seq: 1, timeText: "12:00" },
			].map((row) => ({
				...row,
				fromAgent: event.from,
				toAgent: event.to,
				kind: event.kind,
				skill: event.skill,
				body: event.text,
				payload: {},
				writes: [],
				trace: "seed-trace",
			})),
		);
		const adapter = createCloudflareBus(namespace, script);
		assert.deepEqual(
			(await adapter.events(scope)).map(({ id }) => id),
			["seed", "e100"],
		);
		assert.equal(storage.rows.size, 0);
		assert.deepEqual(await adapter.events({ accountId: "empty-account", mode: "account" }), []);
		assert.equal((await adapter.nextEvent(scope))?.id, "e101");
		assert.equal(published[0]?.text, "Second");
		await storage.put("account", scope.accountId);
		assert.deepEqual(
			(await adapter.events(scope)).map(({ id }) => id),
			["seed", "e100"],
		);
		assert.equal((await target.fetch(new Request("https://bus/events"))).status, 200);
		await assert.rejects(adapter.events({ accountId: "other-account", mode: "account" }));
	} finally {
		await database.close();
	}
});

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

test("accept initializes sequence and seen ids once before new events", async (t) => {
	const database = await openPglite();
	const storage = new Storage();
	const entered = deferred();
	const release = deferred();
	let reads = 0;
	t.mock.method(Pool.prototype, "query", async (config: { text: string; rowMode?: string }, params: unknown[]) => {
		reads += 1;
		entered.resolve();
		await release.promise;
		const result = await database.client.query<Record<string, unknown>>(config.text, params);
		const rows = config.rowMode === "array" ? result.rows.map((row) => Object.values(row)) : result.rows;
		return { ...result, rows };
	});
	t.mock.method(Pool.prototype, "connect", async () => ({
		query: (config: { text: string }, params: unknown[]) => database.client.query(config.text, params),
		release() {},
	}));
	try {
		for (const accountId of [scope.accountId, "fresh-account", "other-account"]) {
			await database.client.query(
				`INSERT INTO accounts (id, account_id, name, owner, email, tint, agents, online, tasks, last_active, created_week, mission, sort_order) VALUES ($1, $1, '', '', '', '', 0, 0, 0, '', 0, '', 0)`,
				[accountId],
			);
		}
		await writePending("postgres://fixture/db", scope.accountId, [
			{ seq: 1, event: { ...event, id: "seed-first", set: { status: "seed" } } },
			{ seq: 2, event: { ...event, id: "seed-second" } },
		]);
		await writePending("postgres://fixture/db", "other-account", [{ seq: 20, event }]);
		const target = bus(storage, "postgres://fixture/db");
		const duplicate = accept(target, {
			accountId: scope.accountId,
			event: { ...event, id: "seed-first", set: { status: "poison" } },
		});
		await entered.promise;
		assert.equal(storage.rows.size, 0);
		const first = accept(target, { accountId: scope.accountId, event: { ...event, id: "new-first" } });
		const second = accept(target, { accountId: scope.accountId, event: { ...event, id: "new-second" } });
		release.resolve();
		assert.deepEqual(await (await duplicate).json(), { seen: true, seq: 2 });
		assert.deepEqual(await (await first).json(), { seen: false, seq: 3 });
		assert.deepEqual(await (await second).json(), { seen: false, seq: 4 });
		assert.equal(reads, 2);
		assert.equal(await storage.get("state:status"), '"seed"');
		assert.deepEqual(await storage.get("tasks:researcher"), ["new-first", "new-second"]);
		const restarted = bus(storage, "postgres://fixture/db");
		const repeat = await accept(restarted, {
			accountId: scope.accountId,
			event: { ...event, id: "seed-second", set: { status: "poison" } },
		});
		assert.deepEqual(await repeat.json(), { seen: true, seq: 4 });
		assert.equal(reads, 2);
		assert.deepEqual((await database.client.query("SELECT value FROM state_entries")).rows, [{ value: '"seed"' }]);
		assert.deepEqual(
			(
				await database.client.query("SELECT id, seq FROM bus_events WHERE account_id = $1 ORDER BY seq", [
					scope.accountId,
				])
			).rows,
			[
				{ id: "seed-first", seq: 1 },
				{ id: "seed-second", seq: 2 },
				{ id: "new-first", seq: 3 },
				{ id: "new-second", seq: 4 },
			],
		);
		const fresh = bus(new Storage(), "postgres://fixture/db");
		assert.deepEqual(await (await accept(fresh, { accountId: "fresh-account", event })).json(), {
			seen: false,
			seq: 1,
		});
		assert.equal(reads, 4);
	} finally {
		release.resolve();
		await database.close();
	}
});

test("failed history initialization accepts nothing and can be retried", async (t) => {
	const storage = new Storage();
	let refuse = true;
	t.mock.method(Pool.prototype, "query", async () => {
		if (refuse) throw new Error("Database refused.");
		return { rows: [] };
	});
	t.mock.method(Pool.prototype, "connect", async () => {
		throw new Error("Database refused.");
	});
	const target = bus(storage, "postgres://fixture/db");
	await assert.rejects(accept(target, { accountId: scope.accountId, event }));
	assert.equal(storage.rows.size, 0);
	refuse = false;
	assert.deepEqual(await (await accept(target, { accountId: scope.accountId, event })).json(), {
		seen: false,
		seq: 1,
	});
	assert.equal(typeof storage.alarm, "number");
});

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
			{ BUS_DEAD_LETTER: "tensquads-bus-dlq" },
		);
		assert.equal(acknowledged, true);
	}
	const events = await workerTestBus().events(scope);
	assert.deepEqual(
		events.map(({ id, kind }) => ({ id, kind })),
		[{ id: "dead-rejected", kind: "Escalation" }],
	);
});

test("a trial dead-letter queue name escalates when it is the configured binding", async () => {
	const trial = "tensquads-bus-dlq-41877304107";
	const accountId = "bus-recovery-trial";
	const trialScope = { accountId, mode: "account" as const };
	for (let index = 0; index < 2; index += 1) {
		let acknowledged = false;
		await handleBusQueue(
			{
				queue: trial,
				messages: [
					{
						id: "rejected",
						body: { accountId, event },
						ack() {
							acknowledged = true;
						},
					},
				],
			},
			{ BUS_DEAD_LETTER: trial },
		);
		assert.equal(acknowledged, true);
	}
	const events = await workerTestBus().events(trialScope);
	assert.deepEqual(
		events.map(({ id, kind }) => ({ id, kind })),
		[{ id: "dead-rejected", kind: "Escalation" }],
	);
});

test("the production dead-letter name is a normal task when it is not configured", async () => {
	const accountId = "bus-recovery-literal";
	const literalScope = { accountId, mode: "account" as const };
	let acknowledged = false;
	await handleBusQueue(
		{
			queue: "tensquads-bus-dlq",
			messages: [
				{
					id: "plain",
					body: { accountId, event: { ...event, id: "plain-task" } },
					ack() {
						acknowledged = true;
					},
				},
			],
		},
		{},
	);
	assert.equal(acknowledged, true);
	const events = await workerTestBus().events(literalScope);
	assert.deepEqual(
		events.map(({ id, kind }) => ({ id, kind })),
		[{ id: "plain-task", kind: "Task" }],
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
	t.mock.method(Pool.prototype, "query", async (config: { text: string; rowMode?: string }, params: unknown[]) => {
		const result = await database.client.query<Record<string, unknown>>(config.text, params);
		const rows = config.rowMode === "array" ? result.rows.map((row) => Object.values(row)) : result.rows;
		return { ...result, rows };
	});
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
		const queued: string[] = [];
		const env = {
			ADAPTERS: mode,
			ACCOUNT_BUS: namespace,
			MACHINE_TOKEN_KEY: key,
			...(mode === "real"
				? {
						BUS_QUEUE: {
							async send(body: { accountId: string; event: PublishedEvent }) {
								queued.push(body.event.id);
								await handleBusQueue(
									{
										queue: "tensquads-bus",
										messages: [{ id: `send-${body.event.id}`, body, ack() {} }],
									},
									env,
								);
							},
						},
					}
				: {}),
		};
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
		if (mode === "real") assert.deepEqual(queued, ["real-researcher"]);
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
	t.mock.method(Pool.prototype, "query", async () => ({ rows: [] }));
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
