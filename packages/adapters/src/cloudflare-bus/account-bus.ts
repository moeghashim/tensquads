import { planNextEvent, type TrafficCursor } from "@tensquads/domain";
import type { PublishedEvent } from "@tensquads/kernel";
import { chooseAdapters } from "../adapter-choice.ts";
import type { ScriptedBusEvent } from "../memory-bus.ts";
import { deliveryBackoffMs } from "../neon/commands/approval-delivery.ts";
import { traceFor } from "../trace.ts";
import { alarmAfterFlush, HEARTBEAT_ALARM, type HeartbeatEnv, recordBeat, sweepHeartbeats } from "./heartbeat.ts";
import { writeMasterCommit } from "./master-commit.ts";
import { finishMaster, MASTER_DONE, MASTER_OPEN, masterEvent, retryOpenMaster } from "./master-retry.ts";
import { prepareMaster } from "./master-step.ts";
import { isBusRecord, isNonEmptyString, isObject, readAgentBody } from "./message.ts";
import {
	drainApprovalDeliveries,
	type PendingBusRow,
	readBusEvents,
	readBusHistory,
	readBusState,
	writePending,
} from "./neon-write.ts";

const ALARM_MS = 30_000;

export interface SyncKv {
	get<T>(key: string): T | undefined;
	put<T>(key: string, value: T): void;
	delete(key: string): boolean;
}

export interface BusStorage {
	get<T>(key: string): Promise<T | undefined>;
	put<T>(key: string, value: T): Promise<void>;
	delete(key: string): Promise<boolean>;
	list<T>(options?: { prefix?: string }): Promise<Map<string, T>>;
	transaction<T>(closure: (txn: BusStorage) => Promise<T>): Promise<T>;
	transactionSync<T>(closure: () => T): T;
	readonly kv: SyncKv;
	setAlarm(scheduledTime: number | Date): Promise<void>;
	getAlarm(): Promise<number | null>;
	deleteAlarm(): Promise<void>;
}

export interface BusState {
	readonly storage: BusStorage;
	acceptWebSocket(socket: WebSocket): void;
	getWebSockets(): WebSocket[];
}

interface PageAuditInput {
	readonly keyboard: boolean;
	readonly contrast: boolean;
	readonly horizontalScroll: boolean;
}

interface RenderedCheck {
	readonly visibleText: string;
	readonly cssContent: readonly string[];
	readonly linkTexts: readonly string[];
	readonly imageCount: number;
	readonly horizontalScroll: boolean;
	readonly keyboard: boolean;
	readonly contrast: boolean;
}

export interface BusObjectEnv extends HeartbeatEnv {
	readonly DATABASE_URL?: string;
	readonly BUS_INSPECT?: string;
	readonly masterReadPage?: (url: string) => Promise<{ status: number; body: string }>;
	readonly masterAudit?: (html: string) => PageAuditInput | Promise<PageAuditInput>;
	readonly masterWriteBrief?: (report?: { readonly gap: string }) => string | Promise<string>;
	readonly masterBrowser?: (html: string) => Promise<RenderedCheck>;
	readonly BROWSER?: unknown;
	readonly OPENAI_API_KEY?: string;
	readonly MASTER_MODEL?: string;
	// A test can drain pending approval deliveries without a live database.
	// It returns the number of rows left. The alarm runs it again later.
	readonly retryDeliveries?: (accountId: string) => Promise<number>;
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

function scriptStep(step: unknown): ScriptedBusEvent | undefined {
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
	return {
		from,
		to,
		kind: kind as ScriptedBusEvent["kind"],
		skill,
		text,
		payload,
		writes: writes as string[],
		set: isObject(step.set) ? step.set : undefined,
	};
}

function advanceBody(
	body: unknown,
): { accountId: string; script: ScriptedBusEvent[]; deadlineAt?: number } | undefined {
	if (!isObject(body) || !isNonEmptyString(body.accountId) || !Array.isArray(body.script)) return undefined;
	const script: ScriptedBusEvent[] = [];
	for (const step of body.script) {
		const parsed = scriptStep(step);
		if (!parsed) return undefined;
		script.push(parsed);
	}
	const deadlineAt =
		typeof body.deadlineAt === "number" && Number.isFinite(body.deadlineAt) ? body.deadlineAt : undefined;
	return { accountId: body.accountId, script, deadlineAt };
}

class DeadlinePassed extends Error {
	constructor() {
		super("The deadline passed before the bus write committed.");
	}
}

async function planAdvance(
	storage: BusStorage,
	accountId: string,
	script: readonly ScriptedBusEvent[],
	deadlineAt?: number,
): Promise<AdvanceResult> {
	if (expired(deadlineAt)) return { accepted: false, expired: true };
	const storedAccount = await storage.get<string>("account");
	if (storedAccount && storedAccount !== accountId) return { accepted: false };
	let current = readCursor(await storage.get("traffic-cursor"));
	const seen = await storage.list<boolean>({ prefix: "seen:" });
	const known = [...seen.keys()].map((key) => ({ id: key.slice("seen:".length) }));
	const ids = new Set(known.map((event) => event.id));
	while (ids.has(`e${current.seq}`)) {
		current = { seq: current.seq + 1, clock: current.clock + 1, scriptIndex: current.scriptIndex + 1 };
	}
	if (expired(deadlineAt)) return { accepted: false, expired: true };
	const plan = planNextEvent(known, script, current, traceFor);
	if (!plan) return { accepted: false };
	const result = await commitDurable(storage, accountId, plan.event, deadlineAt, plan.cursor);
	if (result.expired) return { accepted: false, expired: true };
	if (result.seen || !result.event) return { accepted: false };
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

function writeState(kv: SyncKv, values: PublishedEvent["set"]): void {
	if (!values) return;
	for (const [key, value] of Object.entries(values)) kv.put(`state:${key}`, JSON.stringify(value));
}

function rememberTask(kv: SyncKv, event: PublishedEvent): void {
	if (event.kind !== "Task") return;
	const tasks = kv.get<string[]>(`tasks:${event.to}`) ?? [];
	kv.put(`tasks:${event.to}`, [...tasks, event.id]);
}

function commitSynced(
	kv: SyncKv,
	accountId: string,
	event: PublishedEvent,
	deadlineAt?: number,
	cursor?: TrafficCursor,
): AcceptResult {
	if (expired(deadlineAt)) throw new DeadlinePassed();
	const storedAccount = kv.get<string>("account");
	if (storedAccount && storedAccount !== accountId) return { seen: true, seq: kv.get<number>("seq") ?? 0 };
	if (kv.get(`seen:${event.id}`)) return { seen: true, seq: kv.get<number>("seq") ?? 0 };
	const seq = (kv.get<number>("seq") ?? 0) + 1;
	kv.put("account", accountId);
	kv.put("seq", seq);
	kv.put(`seen:${event.id}`, true);
	kv.put(`event:${seq}`, event);
	writeState(kv, event.set);
	rememberTask(kv, event);
	const pending = kv.get<PendingBusRow[]>("pending") ?? [];
	kv.put("pending", [...pending, { seq, event }]);
	if (cursor) kv.put("traffic-cursor", cursor);
	if (expired(deadlineAt)) throw new DeadlinePassed();
	return { seen: false, seq, event };
}

async function commitDurable(
	storage: BusStorage,
	accountId: string,
	event: PublishedEvent,
	deadlineAt?: number,
	cursor?: TrafficCursor,
	markMaster = false,
): Promise<AcceptResult> {
	if (expired(deadlineAt)) return { seen: false, seq: 0, expired: true };
	let result: AcceptResult;
	try {
		result = storage.transactionSync(() => {
			const committed = commitSynced(storage.kv, accountId, event, deadlineAt, cursor);
			if (markMaster && !committed.seen && committed.event && !storage.kv.get(`${MASTER_DONE}${event.id}`)) {
				storage.kv.put(`${MASTER_OPEN}${event.id}`, event);
			}
			return committed;
		});
	} catch (error) {
		if (error instanceof DeadlinePassed) return { seen: false, seq: 0, expired: true };
		throw error;
	}
	if (!result.seen && result.event) await storage.setAlarm(Date.now() + ALARM_MS);
	return result;
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
		await this.serialize(async () => {
			await sweepHeartbeats(this.ctx.storage, this.env);
			await retryOpenMaster(this.ctx.storage, this.env, (accountId, event) => this.runMaster(accountId, event));
			await this.drainDeliveries();
		});
	}

	// A failed first send arms this route. The alarm then drains the rows.
	private async armDeliveryRetry(request: Request): Promise<Response> {
		const body: unknown = await request.json().catch(() => null);
		if (!isObject(body) || !isNonEmptyString(body.accountId)) {
			return new Response("The message was rejected.", { status: 400 });
		}
		const stored = await this.ctx.storage.get<string>("account");
		if (stored && stored !== body.accountId) return new Response("The message was rejected.", { status: 400 });
		await this.ctx.storage.put("account", body.accountId);
		await this.ctx.storage.put("delivery-attempt", 0);
		const now = this.env.now?.() ?? Date.now();
		await this.ctx.storage.setAlarm(now + deliveryBackoffMs(0));
		return Response.json({ ok: true });
	}

	private async drainDeliveries(): Promise<void> {
		if (chooseAdapters(this.env.ADAPTERS) !== "real") return;
		const accountId = await this.ctx.storage.get<string>("account");
		if (!accountId) return;
		const remaining = await this.drainRemaining(accountId);
		if (remaining === null) return;
		if (remaining > 0) await this.armDeliveryAlarm();
		else await this.ctx.storage.delete("delivery-attempt");
	}

	// A missing source means there is nothing to drain. A failed drain counts as one row left.
	private async drainRemaining(accountId: string): Promise<number | null> {
		try {
			if (this.env.retryDeliveries) return await this.env.retryDeliveries(accountId);
			if (!this.env.DATABASE_URL) return null;
			return await drainApprovalDeliveries(this.env.DATABASE_URL, accountId, async (event) => {
				await this.acceptStored(accountId, event);
			});
		} catch {
			return 1;
		}
	}

	private async armDeliveryAlarm(): Promise<void> {
		const attempt = (await this.ctx.storage.get<number>("delivery-attempt")) ?? 0;
		await this.ctx.storage.put("delivery-attempt", attempt + 1);
		const now = this.env.now?.() ?? Date.now();
		await this.ctx.storage.setAlarm(now + deliveryBackoffMs(attempt));
	}

	private routes(): Map<string, (request: Request) => Promise<Response>> {
		const routes = new Map<string, (request: Request) => Promise<Response>>([
			["/accept", (request: Request) => request.json().then((body: unknown) => this.accept(body))],
			["/advance", (request: Request) => request.json().then((body: unknown) => this.advance(body))],
			["/events", (request: Request) => this.events(request)],
			["/store", (request: Request) => this.store(request)],
			["/socket", () => Promise.resolve(this.socket())],
			["/take", (request: Request) => request.json().then((body: unknown) => this.take(body))],
			["/heartbeat", (request: Request) => this.heartbeat(request)],
			["/deliveries/retry", (request: Request) => this.armDeliveryRetry(request)],
			["/monitor", (request: Request) => this.monitor(request)],
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
			return planAdvance(this.ctx.storage, record.accountId, record.script, record.deadlineAt);
		});
		if (result.expired) return Response.json({ accepted: false, expired: true });
		if (result.event) this.push(result.event);
		await this.flush();
		if (!result.accepted || !result.event) return Response.json({ accepted: false });
		return Response.json({ accepted: true, event: result.event });
	}

	// The caller holds the serial lock. A repeat event id changes nothing.
	private async acceptStored(accountId: string, event: PublishedEvent): Promise<AcceptResult> {
		await this.initialize(accountId);
		const mark = masterEvent(event) && chooseAdapters(this.env.ADAPTERS) === "real";
		const stored = await commitDurable(this.ctx.storage, accountId, event, undefined, undefined, mark);
		if (stored.event) this.push(stored.event);
		const owner = await this.ctx.storage.get<string>("account");
		if (owner === accountId) {
			await finishMaster(this.ctx.storage, this.env, event, !stored.seen, (item) => this.runMaster(accountId, item));
		}
		return stored;
	}

	private async accept(body: unknown): Promise<Response> {
		if (!isBusRecord(body)) return new Response("The message was rejected.", { status: 400 });
		const record = body;
		const result = await this.serialize(() => this.acceptStored(record.accountId, record.event));
		await this.flush();
		return Response.json({ seen: result.seen, seq: result.seq });
	}

	private async runMaster(accountId: string, event: PublishedEvent): Promise<void> {
		const step = await prepareMaster(this.env, accountId, event, this.ctx.storage);
		if (!step) return;
		const kv = this.ctx.storage.kv;
		try {
			this.ctx.storage.transactionSync(() => {
				writeMasterCommit(kv, event.id, step.phase, step.produced, (item) => {
					commitSynced(kv, accountId, item);
				});
			});
		} catch (error) {
			step.restore();
			throw error;
		}
		for (const next of step.produced) this.push(next);
		await this.ctx.storage.setAlarm(Date.now() + ALARM_MS);
	}

	private async monitor(request: Request): Promise<Response> {
		const map = (await this.ctx.storage.get<Record<string, string>>("monitors")) ?? {};
		if (request.method === "GET") {
			const id = new URL(request.url).searchParams.get("id") ?? "";
			const accountId = map[id];
			if (!accountId) return new Response("missing", { status: 404 });
			return Response.json({ accountId });
		}
		if (request.method !== "POST") return new Response("The message was rejected.", { status: 400 });
		const body: unknown = await request.json().catch(() => null);
		if (!isObject(body) || !isNonEmptyString(body.monitorId) || !isNonEmptyString(body.accountId)) {
			return new Response("The message was rejected.", { status: 400 });
		}
		const current = map[body.monitorId];
		if (current && current !== body.accountId) {
			return new Response("The monitor belongs to another account.", { status: 409 });
		}
		map[body.monitorId] = body.accountId;
		await this.ctx.storage.put("monitors", map);
		return Response.json({ ok: true });
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
			const due = await txn.get(HEARTBEAT_ALARM);
			const next = alarmAfterFlush(remaining.length, due, Date.now(), ALARM_MS);
			if (next === null) await txn.deleteAlarm();
			else await txn.setAlarm(next);
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

	private async heartbeat(request: Request): Promise<Response> {
		const read = await readAgentBody(request);
		if (!read) return new Response("The message was rejected.", { status: 400 });
		const stored = await this.ctx.storage.get<string>("account");
		if (stored && stored !== read.accountId) return new Response("The message was rejected.", { status: 400 });
		const at = this.env.now?.() ?? Date.now();
		await this.withAccount(read.accountId, () => recordBeat(this.ctx.storage, read.agentId, at));
		return Response.json({ ok: true });
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
