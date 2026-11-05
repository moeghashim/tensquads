import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import type { PublishedEvent } from "@tensquads/kernel";
import { asc, eq } from "drizzle-orm";
import * as esbuild from "esbuild";
import { Miniflare, NoOpLog } from "miniflare";
import { signMachineToken } from "../src/cloudflare-bus/token.ts";
import { openPostgres, schema } from "../src/index.ts";
import workerEntry, { AccountBus as WorkerAccountBus } from "./bus-worker.ts";

assert.equal(WorkerAccountBus.name, "AccountBus");
assert.equal(typeof workerEntry.fetch, "function");
assert.equal(typeof workerEntry.queue, "function");

const connection = loadTestDatabase();
const skipped = connection.length === 0 && process.env.GITHUB_ACTOR === "dependabot[bot]";
if (skipped) console.log("TEST_DATABASE_URL was skipped.");
if (connection.length === 0 && !skipped) throw new Error("TEST_DATABASE_URL is missing.");

const accounts = new Set<string>();
const refuseUrl = "postgres://127.0.0.1:9/db";
let bundleDir = "";
let bundling: Promise<string> | undefined;
let opened: ReturnType<typeof openPostgres> | undefined;
let live: Miniflare | undefined;
let opening: Promise<Miniflare> | undefined;

function loadTestDatabase(): string {
	const fromEnv = process.env.TEST_DATABASE_URL ?? "";
	if (fromEnv.length > 0) return fromEnv;
	try {
		const text = readFileSync(fileURLToPath(new URL("../../../.env", import.meta.url)), "utf8");
		for (const line of text.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed.startsWith("TEST_DATABASE_URL=")) continue;
			let value = trimmed.slice("TEST_DATABASE_URL=".length).trim();
			const quote = value[0];
			if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) value = value.slice(1, -1);
			return value;
		}
	} catch {
		return "";
	}
	return "";
}

function databaseName(value: string): string {
	try {
		return new URL(value).pathname.replace(/^\//, "").split("?")[0] ?? "";
	} catch {
		throw new Error("The test database url is not valid.");
	}
}

function refuseProduction(): void {
	const neon = process.env.NEON_POSTGRES_CONNECTION_STRING;
	if (neon && connection === neon) throw new Error("refusing the Neon connection");
	if (databaseName(connection) === "neondb") throw new Error("refusing the production database");
}

function safe(body: string): string {
	let text = body;
	if (connection.length > 0) text = text.split(connection).join("redacted");
	try {
		const password = new URL(connection).password;
		if (password.length > 0) text = text.split(decodeURIComponent(password)).join("redacted");
	} catch {
		return text;
	}
	return text;
}

function account(): string {
	const id = `bus-${randomBytes(4).toString("hex")}`;
	accounts.add(id);
	return id;
}

async function ensureAccount(id: string): Promise<void> {
	if (!opened) throw new Error("The test database is not open.");
	await opened.db
		.insert(schema.accounts)
		.values({
			id,
			accountId: id,
			name: "Bus",
			owner: "Bus",
			email: `${id}@example.com`,
			tint: "slate",
			agents: 0,
			online: 0,
			tasks: 0,
			lastActive: "Just started",
			createdWeek: 0,
			mission: "",
			sortOrder: 0,
		})
		.onConflictDoNothing();
}

async function prepared(id = account()): Promise<{ mf: Miniflare; id: string }> {
	const mf = await liveWorker();
	await ensureAccount(id);
	return { mf, id };
}

function published(id: string, extra: Partial<PublishedEvent> = {}): PublishedEvent {
	return {
		id,
		from: "master",
		to: "researcher",
		kind: "Task",
		skill: "research",
		text: "Look at the market.",
		payload: {},
		writes: [],
		time: "12:00",
		...extra,
	};
}

function externalNode(): esbuild.Plugin {
	return {
		name: "external-node",
		setup(build) {
			build.onResolve({ filter: /^(node:|cloudflare:)/ }, (args) => ({ path: args.path, external: true }));
		},
	};
}

function masterStub(): esbuild.Plugin {
	const stub = fileURLToPath(new URL("../src/cloudflare-bus/master-stub.ts", import.meta.url));
	return {
		name: "master-stub",
		setup(build) {
			build.onResolve({ filter: /master-live\.ts$/ }, () => ({ path: stub }));
		},
	};
}

function bundleWorker(): Promise<string> {
	bundling ??= (async () => {
		const directory = mkdtempSync(join(tmpdir(), "tensquads-bus-"));
		bundleDir = directory;
		await esbuild.build({
			entryPoints: [fileURLToPath(new URL("./bus-worker.ts", import.meta.url))],
			bundle: true,
			format: "esm",
			platform: "neutral",
			target: "es2024",
			conditions: ["workerd", "worker", "browser"],
			mainFields: ["module", "main"],
			outfile: join(directory, "index.js"),
			legalComments: "none",
			logLevel: "silent",
			plugins: [masterStub(), externalNode()],
		});
		return directory;
	})();
	return bundling;
}

function workerConfig(databaseUrl: string, tokenKey?: string) {
	const directory = bundleDir;
	return {
		name: "tensquads",
		compatibilityDate: "2026-10-23",
		compatibilityFlags: ["nodejs_compat", "nodejs_compat_populate_process_env"],
		manifest: {
			mainModule: "index.js",
			modulesRoot: directory,
			modules: { "index.js": { type: "esm" as const, contents: readFileSync(join(directory, "index.js"), "utf8") } },
		},
		env: {
			ADAPTERS: { type: "text" as const, value: "real" },
			BUS_INSPECT: { type: "text" as const, value: "1" },
			DATABASE_URL: { type: "text" as const, value: databaseUrl },
			ACCOUNT_BUS: { type: "durable-object" as const, worker: "tensquads", exportName: "AccountBus" },
			BUS_QUEUE: { type: "queue" as const, name: "tensquads-bus" },
			BUS_DEAD_LETTER: { type: "text" as const, value: "tensquads-bus-dlq" },
			...(tokenKey === undefined ? {} : { MACHINE_TOKEN_KEY: { type: "text" as const, value: tokenKey } }),
		},
		exports: { AccountBus: { type: "durable-object" as const, storage: "sqlite" as const } },
		triggers: [
			{
				type: "queue" as const,
				name: "tensquads-bus",
				deadLetterQueue: "tensquads-bus-dlq",
				maxRetries: 3,
				maxBatchSize: 1,
				maxBatchTimeout: 0,
			},
			{ type: "queue" as const, name: "tensquads-bus-dlq" },
		],
	};
}

async function boot(databaseUrl: string, tokenKey?: string): Promise<Miniflare> {
	await bundleWorker();
	return new Miniflare({ log: new NoOpLog(), workers: [{ config: workerConfig(databaseUrl, tokenKey) }] });
}

function liveWorker(): Promise<Miniflare> {
	opening ??= (async () => {
		refuseProduction();
		const database = openPostgres(connection);
		opened = database;
		try {
			await database.migrate();
		} catch (error) {
			throw new Error(safe(error instanceof Error ? error.message : "The migration failed."));
		}
		live = await boot(connection, "machine-token-fixture");
		return live;
	})();
	return opening;
}

async function send(mf: Miniflare, path: string, body: unknown, headers?: Record<string, string>): Promise<Response> {
	return mf.dispatchFetch(`http://localhost${path}`, {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: JSON.stringify(body),
	});
}

async function bodyText(response: Response): Promise<string> {
	const text = safe(await response.text());
	if (text.includes("redacted") && response.ok) throw new Error("the response leaked the database url");
	return text;
}

async function publish(
	mf: Miniflare,
	accountId: string,
	event: PublishedEvent,
): Promise<{ seen: boolean; seq: number }> {
	const response = await send(mf, "/publish", { accountId, event });
	const text = await bodyText(response);
	assert.equal(response.status, 200, text);
	return JSON.parse(text) as { seen: boolean; seq: number };
}

async function readJson<T>(mf: Miniflare, accountId: string, path: string): Promise<T> {
	const query = new URLSearchParams({ account: accountId, path });
	const response = await mf.dispatchFetch(`http://localhost/read?${query}`);
	const text = await bodyText(response);
	assert.equal(response.status, 200, text);
	return JSON.parse(text) as T;
}

async function neonRows(accountId: string) {
	if (!opened) throw new Error("The test database is not open.");
	return opened.db
		.select()
		.from(schema.busEvents)
		.where(eq(schema.busEvents.accountId, accountId))
		.orderBy(asc(schema.busEvents.seq));
}

async function neonState(accountId: string) {
	if (!opened) throw new Error("The test database is not open.");
	return opened.db.select().from(schema.stateEntries).where(eq(schema.stateEntries.accountId, accountId));
}

after(async () => {
	await live?.dispose();
	if (opened) {
		for (const id of accounts) {
			await opened.db.delete(schema.busEvents).where(eq(schema.busEvents.accountId, id));
			await opened.db.delete(schema.stateEntries).where(eq(schema.stateEntries.accountId, id));
			await opened.db.delete(schema.accounts).where(eq(schema.accounts.id, id));
		}
		await opened.close();
	}
	if (bundleDir.length > 0) rmSync(bundleDir, { recursive: true, force: true });
});

test("parallel events keep one sequence and a repeat changes nothing", { skip: skipped }, async () => {
	const { mf, id } = await prepared();
	const names = Array.from({ length: 8 }, (_, index) => `p-${index}`);
	await Promise.all(names.map((name) => publish(mf, id, published(name))));
	const rows = await neonRows(id);
	assert.deepEqual(
		rows.map((row) => row.seq),
		[1, 2, 3, 4, 5, 6, 7, 8],
	);
	assert.equal(new Set(rows.map((row) => row.id)).size, 8);
	const first = await publish(mf, id, published("p-0", { set: { status: "second" }, time: "01:00" }));
	assert.equal(first.seen, true);
	assert.equal(first.seq, 8);
	assert.deepEqual(await readJson(mf, id, "/local-store"), {});
	assert.equal((await neonRows(id)).length, 8);
});

test("two accounts do not share a sequence", { skip: skipped }, async () => {
	const mf = await liveWorker();
	const first = account();
	const second = account();
	await ensureAccount(first);
	await ensureAccount(second);
	await publish(mf, first, published("a1"));
	await publish(mf, second, published("b1"));
	await publish(mf, first, published("a2"));
	assert.deepEqual(await readJson(mf, first, "/seq"), { seq: 2 });
	assert.deepEqual(await readJson(mf, second, "/seq"), { seq: 1 });
	assert.deepEqual(
		(await neonRows(first)).map((row) => row.seq),
		[1, 2],
	);
	assert.deepEqual(
		(await neonRows(second)).map((row) => row.seq),
		[1],
	);
});

test("one accept writes every key and events sort by sequence", { skip: skipped }, async () => {
	const { mf, id } = await prepared();
	await publish(
		mf,
		id,
		published("late", { time: "23:59", writes: ["alpha", "beta"], set: { alpha: "one", beta: 2 } }),
	);
	await publish(mf, id, published("early", { time: "00:01" }));
	const events = await readJson<PublishedEvent[]>(mf, id, "/events");
	assert.deepEqual(
		events.map((event) => event.id),
		["late", "early"],
	);
	assert.deepEqual(await readJson(mf, id, "/store"), { alpha: "one", beta: 2 });
	const state = await neonState(id);
	const stored = Object.fromEntries(state.map((row) => [row.key, row.value]));
	assert.deepEqual(stored, { alpha: JSON.stringify("one"), beta: JSON.stringify(2) });
});

test("nextEvent writes one row through the same accept path", { skip: skipped }, async () => {
	const { mf, id } = await prepared();
	const response = await send(mf, "/next", {
		accountId: id,
		script: [
			{
				from: "master",
				to: "researcher",
				kind: "Task",
				skill: "research",
				text: "Look at the market.",
				payload: { topic: "prints" },
				writes: ["topic"],
				set: { topic: "prints" },
			},
		],
	});
	const text = await bodyText(response);
	assert.equal(response.status, 200, text);
	const event = JSON.parse(text) as PublishedEvent;
	assert.equal(event.id, "e100");
	const rows = await neonRows(id);
	assert.equal(rows.length, 1);
	assert.equal(rows[0]?.id, "e100");
	assert.equal(rows[0]?.seq, 1);
	const state = await neonState(id);
	assert.equal(state[0]?.key, "topic");
	assert.equal(state[0]?.value, JSON.stringify("prints"));
});

test("a dead letter makes one escalation and a repeat delivery makes no second row", { skip: skipped }, async () => {
	const { mf, id } = await prepared();
	const event = published("once");
	for (let time = 0; time < 2; time += 1) {
		const response = await send(mf, "/queue", {
			queue: "tensquads-bus",
			messages: [{ id: `delivery-${time}`, body: { accountId: id, event } }],
		});
		assert.equal(response.status, 200, await bodyText(response));
	}
	for (let time = 0; time < 2; time += 1) {
		const response = await send(mf, "/queue", {
			queue: "tensquads-bus-dlq",
			messages: [{ id: "m1", body: { accountId: id } }],
		});
		assert.equal(response.status, 200, await bodyText(response));
	}
	const rows = await neonRows(id);
	assert.deepEqual(
		rows.map((row) => row.id),
		["once", "dead-m1"],
	);
	const escalation = rows[1];
	assert.equal(escalation?.kind, "Escalation");
	assert.equal(escalation?.fromAgent, "bus");
	assert.equal(escalation?.toAgent, "master");
	assert.equal(escalation?.skill, "bus.retry");
	assert.equal(escalation?.body, "A message failed all retries.");
	assert.deepEqual(escalation?.payload, { messageId: "m1" });
});

test("a machine token sends and takes one task and a bad token is rejected", { skip: skipped }, async () => {
	const id = `ac.me-${randomBytes(3).toString("hex")}`;
	accounts.add(id);
	const { mf } = await prepared(id);
	const agent = "researcher";
	const exp = Math.floor(Date.now() / 1000) + 3600;
	const token = await signMachineToken("machine-token-fixture", id, agent, exp);
	const headers = { authorization: `Bearer ${token}` };
	const sent = await send(
		mf,
		"/machine/send",
		{ accountId: id, agentId: agent, event: published("task-1", { from: agent, to: agent }) },
		headers,
	);
	assert.equal(sent.status, 200, await bodyText(sent));
	const started = Date.now();
	for (;;) {
		const queued = await readJson<PublishedEvent[]>(mf, id, "/local-events");
		if (queued.some((row) => row.id === "task-1")) break;
		assert.ok(Date.now() - started < 2_000, "the queued machine send was not accepted");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	await publish(mf, id, published("other-task", { to: "clerk", kind: "Task" }));
	const first = await send(mf, "/machine/take", { accountId: id, agentId: agent }, headers);
	const taken = JSON.parse(await bodyText(first)) as PublishedEvent[];
	assert.deepEqual(
		taken.map((event) => event.id),
		["task-1"],
	);
	const second = await send(mf, "/machine/take", { accountId: id, agentId: agent }, headers);
	assert.deepEqual(JSON.parse(await bodyText(second)), []);
	const stored = await readJson<PublishedEvent[]>(mf, id, "/local-events");
	assert.deepEqual(stored.map((event) => event.id).sort(), ["other-task", "task-1"]);
	assert.equal(
		(await neonRows(id)).some((row) => row.id === "task-1"),
		true,
	);
	const wrong = await signMachineToken("machine-token-fixture", "other-account", agent, exp);
	const rejected = await send(
		mf,
		"/machine/send",
		{ accountId: id, agentId: agent, event: published("nope") },
		{ authorization: `Bearer ${wrong}` },
	);
	assert.equal(rejected.status, 401);
	assert.equal(await bodyText(rejected), "The token was rejected.");
	const expired = await signMachineToken("machine-token-fixture", id, agent, 1);
	const late = await send(
		mf,
		"/machine/take",
		{ accountId: id, agentId: agent },
		{ authorization: `Bearer ${expired}` },
	);
	assert.equal(late.status, 401);
});

test("the socket receives the new event", { skip: skipped }, async () => {
	const mf = await liveWorker();
	const id = account();
	const response = await mf.dispatchFetch(`http://localhost/socket?account=${encodeURIComponent(id)}`, {
		headers: { Upgrade: "websocket" },
	});
	const socket = response.webSocket;
	assert.ok(socket, "the socket is missing");
	socket.accept();
	const incoming = new Promise<string>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("the socket sent no event")), 5_000);
		socket.addEventListener("message", (event) => {
			clearTimeout(timer);
			resolve(String(event.data));
		});
	});
	await publish(mf, id, published("pushed"));
	assert.equal(JSON.parse(await incoming).id, "pushed");
	socket.close();
});

test("a refused database keeps the event and sets an alarm", { skip: skipped, timeout: 20_000 }, async () => {
	const { id } = await prepared();
	const mf = await boot(connection, "machine-token-fixture");
	try {
		await publish(mf, id, published("initialized"));
		await mf.setOptions({
			log: new NoOpLog(),
			workers: [{ config: workerConfig(refuseUrl, "machine-token-fixture") }],
		});
		const result = await publish(mf, id, published("held"));
		assert.equal(result.seen, false);
		const alarm = await readJson<{ alarm: number | null }>(mf, id, "/alarm");
		assert.equal(typeof alarm.alarm, "number");
		const events = await readJson<PublishedEvent[]>(mf, id, "/local-events");
		assert.deepEqual(
			events.map((event) => event.id),
			["initialized", "held"],
		);
	} finally {
		await mf.dispose();
	}
});

test("a missing token key refuses the machine call", { skip: skipped }, async () => {
	const mf = await boot(refuseUrl);
	try {
		const response = await send(mf, "/machine/send", {
			accountId: "closed",
			agentId: "researcher",
			event: published("closed"),
		});
		assert.equal(response.status, 503);
		assert.equal(await bodyText(response), "The machine service is not configured.");
	} finally {
		await mf.dispose();
	}
});
