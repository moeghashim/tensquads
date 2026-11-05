import { planNextEvent, type TrafficCursor } from "@tensquads/domain";
import type { PublishedEvent } from "@tensquads/kernel";

import type { ScriptedBusEvent } from "../memory-bus.ts";
import { traceFor } from "../trace.ts";
import { isBusRecord, isNonEmptyString, isObject } from "./message.ts";
import { type PendingBusRow, readBusEvents, readBusHistory, readBusState, writePending } from "./neon-write.ts";

const ALARM_MS = 30_000;

export interface BusStorage {
	get<T>(key: string): Promise<T | undefined>;
	put<T>(key: string, value: T): Promise<void>;
	list<T>(options?: { prefix?: string }): Promise<Map<string, T>>;
	transaction<T>(closure: (txn: BusStorage) => Promise<T>): Promise<T>;
	setAlarm(scheduledTime: number | Date): Promise<void>;
	getAlarm(): Promise<number | null>;
	deleteAlarm(): Promise<void>;
}

export interface BusState {
	readonly storage: BusStorage;
	acceptWebSocket(socket: WebSocket): void;
	getWebSockets(): WebSocket[];
}

export interface BusObjectEnv {
	readonly DATABASE_URL?: string;
	readonly BUS_INSPECT?: string;
}

interface AcceptResult {
	readonly seen: boolean;
	readonly expired?: boolean;
	readonly seq: number;
	readonly event?: PublishedEvent;
}

interface AdvanceResult {
	readonly accepted: boolean;
	readonly expired?: boolean;
	readonly event?: PublishedEvent;
}

const openedCursor: TrafficCursor = { seq: 100, clock: 11 * 60 + 2, scriptIndex: 0 };

function readCursor(value: unknown): TrafficCursor {
	if (!isObject(value)) return openedCursor;
	const { seq, clock, scriptIndex } = value;
	if (typeof seq !== "number" || typeof clock !== "number" || typeof scriptIndex !== "number") return openedCursor;
	return { seq, clock, scriptIndex };
}

function expired(deadlineAt?: number): boolean {
	return deadlineAt !== undefined && Date.now() >= deadlineAt;
}

function advanceBody(
	body: unknown,
): { accountId: string; script: ScriptedBusEvent[]; deadlineAt?: number } | undefined {
	if (!isObject(body) || !isNonEmptyString(body.accountId) || !Array.isArray(body.script)) return undefined;
	const script: ScriptedBusEvent[] = [];
	for (const step of body.script) {
		if (!isObject(step)) return undefined;
		const from = step.from;
		const to = step.to;
		const kind = step.kind;
		const skill = step.skill;
		const text = step.text;
		const payload = step.payload;
		if (!isNonEmptyString(from) || !isNonEmptyString(to) || !isNonEmptyString(kind)) return undefined;
		if (!isNonEmptyString(skill) || !isNonEmptyString(text) || !isObject(payload)) return undefined;
		const writes = step.writes === undefined ? [] : step.writes;
		if (!Array.isArray(writes) || writes.some((key) => typeof key !== "string")) return undefined;
		if (step.set !== undefined && !isObject(step.set)) return undefined;
		script.push({
			from,
			to,
			kind: kind as ScriptedBusEvent["kind"],
			skill,
			text,
			payload,
			writes: writes as string[],
			set: isObject(step.set) ? step.set : undefined,
		});
	}
	const deadlineAt =
		typeof body.deadlineAt === "number" && Number.isFinite(body.deadlineAt) ? body.deadlineAt : undefined;
	return { accountId: body.accountId, script, deadlineAt };
}

async function planAdvance(
	txn: BusStorage,
	accountId: string,
	script: readonly ScriptedBusEvent[],
	deadlineAt?: number,
): Promise<AdvanceResult> {
	if (expired(deadlineAt)) return { accepted: false, expired: true };
	const storedAccount = await txn.get<string>("account");
	if (storedAccount && storedAccount !== accountId) return { accepted: false };
	let current = readCursor(await txn.get("traffic-cursor"));
	const seen = await txn.list<boolean>({ prefix: "seen:" });
	const known = [...seen.keys()].map((key) => ({ id: key.slice("seen:".length) }));
	const ids = new Set(known.map((event) => event.id));
	while (ids.has(`e${current.seq}`)) {
		current = { seq: current.seq + 1, clock: current.clock + 1, scriptIndex: current.scriptIndex + 1 };
	}
	if (expired(deadlineAt)) return { accepted: false, expired: true };
	const plan = planNextEvent(known, script, current, traceFor);
	if (!plan) return { accepted: false };
	const result = await commitEvent(txn, accountId, plan.event, deadlineAt);
	if (result.expired) return { accepted: false, expired: true };
	if (result.seen || !result.event) return { accepted: false };
	await txn.put("traffic-cursor", plan.cursor);
	return { accepted: true, event: result.event };
}

function socketPair(): { 0: WebSocket; 1: WebSocket } {
	const Factory = (globalThis as { WebSocketPair?: new () => { 0: WebSocket; 1: WebSocket } }).WebSocketPair;
	if (!Factory) throw new Error("The bus is not configured.");
	return new Factory();
}

async function listed<T>(storage: BusStorage, prefix: string): Promise<readonly [string, T][]> {
	const rows = await storage.list<T>({ prefix });
	return [...rows.entries()].sort((left, right) => left[0].localeCompare(right[0], "en", { numeric: true }));
}

async function seenSeq(txn: BusStorage, accountId: string, eventId: string): Promise<AcceptResult | undefined> {
	const storedAccount = await txn.get<string>("account");
	if (storedAccount && storedAccount !== accountId) {
		return { seen: true, seq: (await txn.get<number>("seq")) ?? 0 };
	}
	if (await txn.get(`seen:${eventId}`)) return { seen: true, seq: (await txn.get<number>("seq")) ?? 0 };
	return undefined;
}

async function putSet(txn: BusStorage, values: PublishedEvent["set"]): Promise<void> {
	if (!values) return;
	for (const [key, value] of Object.entries(values)) await txn.put(`state:${key}`, JSON.stringify(value));
}

async function rememberTask(txn: BusStorage, event: PublishedEvent): Promise<void> {
	if (event.kind !== "Task") return;
	const tasks = (await txn.get<string[]>(`tasks:${event.to}`)) ?? [];
	await txn.put(`tasks:${event.to}`, [...tasks, event.id]);
}

async function commitEvent(
	txn: BusStorage,
	accountId: string,
	event: PublishedEvent,
	deadlineAt?: number,
): Promise<AcceptResult> {
	const prior = await seenSeq(txn, accountId, event.id);
	if (prior) return prior;
	const seq = ((await txn.get<number>("seq")) ?? 0) + 1;
	if (expired(deadlineAt)) return { seen: false, seq, expired: true };
	await txn.put("account", accountId);
	await txn.put("seq", seq);
	await txn.put(`seen:${event.id}`, true);
	await txn.put(`event:${seq}`, event);
	await putSet(txn, event.set);
	await rememberTask(txn, event);
	const pending = (await txn.get<PendingBusRow[]>("pending")) ?? [];
	await txn.put("pending", [...pending, { seq, event }]);
	await txn.setAlarm(Date.now() + ALARM_MS);
	return { seen: false, seq, event };
}

export class AccountBus {
	private readonly ctx: BusState;
	private readonly env: BusObjectEnv;
	private accepting: Promise<void> = Promise.resolve();
	private flushing: Promise<void> = Promise.resolve();

	constructor(ctx: BusState, env: BusObjectEnv) {
		this.ctx = ctx;
		this.env = env;
	}

	// The runtime calls fetch. No module in this repo calls it.
	async fetch(request: Request): Promise<Response> {
		const handler = this.routes().get(new URL(request.url).pathname);
		if (!handler) return new Response("missing", { status: 404 });
		return handler(request);
	}

	// The runtime calls alarm. No module in this repo calls it.
	async alarm(): Promise<void> {
		await this.flush();
	}

	private routes(): Map<string, (request: Request) => Promise<Response>> {
		const routes = new Map<string, (request: Request) => Promise<Response>>([
			["/accept", (request: Request) => request.json().then((body: unknown) => this.accept(body))],
			["/advance", (request: Request) => request.json().then((body: unknown) => this.advance(body))],
			["/events", (request: Request) => this.events(request)],
			["/store", (request: Request) => this.store(request)],
			["/socket", () => Promise.resolve(this.socket())],
			["/take", (request: Request) => request.json().then((body: unknown) => this.take(body))],
		]);
		if (this.env.BUS_INSPECT === "1") {
			routes.set("/seq", async () => Response.json({ seq: (await this.ctx.storage.get<number>("seq")) ?? 0 }));
			routes.set("/alarm", async () => Response.json({ alarm: await this.ctx.storage.getAlarm() }));
			routes.set("/local-store", async () => Response.json(await this.stateMap()));
			routes.set("/local-events", async () => Response.json(await this.storedEvents()));
		}
		return routes;
	}

	private async advance(body: unknown): Promise<Response> {
		const record = advanceBody(body);
		if (!record) return new Response("The message was rejected.", { status: 400 });
		const result = await this.serialize<AdvanceResult>(async () => {
			if (expired(record.deadlineAt)) return { accepted: false, expired: true };
			await this.initialize(record.accountId);
			if (expired(record.deadlineAt)) return { accepted: false, expired: true };
			return this.ctx.storage.transaction((txn) =>
				planAdvance(txn, record.accountId, record.script, record.deadlineAt),
			);
		});
		if (result.expired) return Response.json({ accepted: false, expired: true });
		if (result.event) this.push(result.event);
		await this.flush();
		if (!result.accepted || !result.event) return Response.json({ accepted: false });
		return Response.json({ accepted: true, event: result.event });
	}

	private async accept(body: unknown): Promise<Response> {
		if (!isBusRecord(body)) return new Response("The message was rejected.", { status: 400 });
		const record = body;
		const result = await this.withAccount(record.accountId, () =>
			this.ctx.storage.transaction((txn) => commitEvent(txn, record.accountId, record.event)),
		);
		if (result.event) this.push(result.event);
		await this.flush();
		return Response.json({ seen: result.seen, seq: result.seq });
	}

	private withAccount<T>(accountId: string, operation: () => Promise<T>): Promise<T> {
		return this.serialize(async () => {
			await this.initialize(accountId);
			return operation();
		});
	}

	private serialize<T>(operation: () => Promise<T>): Promise<T> {
		const next = this.accepting.then(operation);
		this.accepting = next.then(
			() => undefined,
			() => undefined,
		);
		return next;
	}

	private async initialize(accountId: string): Promise<void> {
		const storedAccount = await this.ctx.storage.get<string>("account");
		if (storedAccount && storedAccount !== accountId) return;
		if ((await this.ctx.storage.get<number>("seq")) !== undefined) return;
		const history = this.env.DATABASE_URL ? await readBusHistory(this.env.DATABASE_URL, accountId) : [];
		const state = this.env.DATABASE_URL ? await readBusState(this.env.DATABASE_URL, accountId) : [];
		await this.ctx.storage.transaction(async (txn) => {
			await txn.put("account", accountId);
			await txn.put(
				"seq",
				history.reduce((seq, row) => Math.max(seq, row.seq), 0),
			);
			for (const row of history) await txn.put(`seen:${row.event.id}`, true);
			for (const row of state) await txn.put(`state:${row.key}`, row.value);
		});
	}

	private push(event: PublishedEvent): void {
		const text = JSON.stringify(event);
		for (const socket of this.ctx.getWebSockets()) socket.send(text);
	}

	private flush(): Promise<void> {
		const next = this.flushing.then(() => this.flushPending());
		this.flushing = next.catch(() => undefined);
		return next;
	}

	private async flushPending(): Promise<void> {
		const pending = (await this.ctx.storage.get<PendingBusRow[]>("pending")) ?? [];
		const accountId = await this.ctx.storage.get<string>("account");
		if (pending.length === 0 || !accountId || !this.env.DATABASE_URL) {
			if (pending.length > 0) await this.ctx.storage.setAlarm(Date.now() + ALARM_MS);
			return;
		}
		try {
			await writePending(this.env.DATABASE_URL, accountId, pending);
		} catch {
			await this.ctx.storage.setAlarm(Date.now() + ALARM_MS);
			return;
		}
		const written = new Set(pending.map((row) => row.event.id));
		await this.ctx.storage.transaction(async (txn) => {
			const current = (await txn.get<PendingBusRow[]>("pending")) ?? [];
			const remaining = current.filter((row) => !written.has(row.event.id));
			await txn.put("pending", remaining);
			if (remaining.length === 0) await txn.deleteAlarm();
			else await txn.setAlarm(Date.now() + ALARM_MS);
		});
	}

	private async events(request: Request): Promise<Response> {
		const storedAccount = await this.ctx.storage.get<string>("account");
		const accountId = request.headers.get("x-account-id") ?? storedAccount;
		if (storedAccount && storedAccount !== accountId) {
			return new Response("The message was rejected.", { status: 400 });
		}
		if (!accountId || !this.env.DATABASE_URL) return Response.json([]);
		try {
			return Response.json(await readBusEvents(this.env.DATABASE_URL, accountId));
		} catch {
			return new Response("The bus is not configured.", { status: 503 });
		}
	}

	private async storedEvents(): Promise<PublishedEvent[]> {
		const rows = await listed<PublishedEvent>(this.ctx.storage, "event:");
		return rows.map((entry) => entry[1]);
	}

	private async store(request: Request): Promise<Response> {
		const accountId = request.headers.get("x-account-id") ?? (await this.ctx.storage.get<string>("account"));
		if (!accountId) return Response.json({});
		return this.withAccount(accountId, async () => {
			if ((await this.ctx.storage.get<string>("account")) !== accountId) {
				return new Response("The message was rejected.", { status: 400 });
			}
			return Response.json(await this.stateMap());
		});
	}

	private async stateMap(): Promise<Record<string, unknown>> {
		const rows = await listed<string>(this.ctx.storage, "state:");
		const store: Record<string, unknown> = {};
		for (const [key, value] of rows) store[key.slice("state:".length)] = JSON.parse(value) as unknown;
		return store;
	}

	private async take(body: unknown): Promise<Response> {
		const agentId = (body as { agentId?: string }).agentId ?? "";
		const ids = (await this.ctx.storage.get<string[]>(`tasks:${agentId}`)) ?? [];
		await this.ctx.storage.put(`tasks:${agentId}`, []);
		const events = await this.storedEvents();
		return Response.json(events.filter((event) => ids.includes(event.id)));
	}

	private socket(): Response {
		const pair = socketPair();
		this.ctx.acceptWebSocket(pair[1]);
		return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
	}
}
