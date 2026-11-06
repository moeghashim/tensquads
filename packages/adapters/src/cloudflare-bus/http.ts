import type { AccountEventBus, AccountScope, PublishedEvent } from "@tensquads/kernel";
import { MachineFault } from "@tensquads/kernel";

import { chooseAdapters } from "../adapter-choice.ts";
import type { ScriptedBusEvent } from "../memory-bus.ts";
import { takeTestTask, workerTestBus } from "../worker-adapters.ts";
import { changeEvent, verifyContextSignature } from "./change.ts";
import { isBusRecord, isNonEmptyString, isObject, readAgentBody } from "./message.ts";
import { recordMonitorSecret, resolveMonitor, resolveMonitorSecret } from "./monitors.ts";
import { type MachineTokenDelivery, machineTokenDelivery, verifyMachineToken } from "./token.ts";

const UNKNOWN_MONITOR_SECRET = "tensquads-unknown-monitor";

export interface BusNamespace {
	idFromName(name: string): unknown;
	get(id: unknown): { fetch(input: Request | string | URL, init?: RequestInit): Promise<Response> };
}

export interface QueueProducer {
	send(message: { accountId: string; event: PublishedEvent }): Promise<void>;
}

export interface WorkerBindings {
	readonly ADAPTERS?: string;
	readonly MACHINE_TOKEN_KEY?: string;
	readonly ACCOUNT_BUS?: BusNamespace;
	readonly BUS_QUEUE?: QueueProducer;
	readonly BUS_DEAD_LETTER?: string;
	readonly DATABASE_URL?: string;
	readonly now?: () => number;
	readonly BROWSER?: unknown;
	readonly OPENAI_API_KEY?: string;
	// A test can name the accounts with old pending deliveries without a live database.
	readonly staleDeliveryAccounts?: (beforeMs: number) => Promise<string[]>;
}

export interface BusMessage {
	readonly id: string;
	readonly body: unknown;
	ack(): void;
}

export interface BusBatch {
	readonly queue: string;
	readonly messages: readonly BusMessage[];
}

function notConfigured(message = "The machine service is not configured."): MachineFault {
	return new MachineFault("unavailable", message);
}

function escalation(messageId: string): PublishedEvent {
	return {
		id: `dead-${messageId}`,
		from: "bus",
		to: "master",
		kind: "Escalation",
		skill: "bus.retry",
		text: "A message failed all retries.",
		payload: { messageId },
		writes: [],
	};
}

async function stubFetch(env: WorkerBindings, accountId: string, path: string, init?: RequestInit): Promise<Response> {
	const namespace = env.ACCOUNT_BUS;
	if (!namespace) throw notConfigured("The bus is not configured.");
	return namespace.get(namespace.idFromName(accountId)).fetch(`https://bus${path}`, init);
}

async function deliver(env: WorkerBindings, accountId: string, event: PublishedEvent): Promise<boolean> {
	if (chooseAdapters(env.ADAPTERS) !== "real") {
		await workerTestBus().publish({ accountId, mode: "account" }, event);
		return false;
	}
	const response = await stubFetch(env, accountId, "/accept", {
		method: "POST",
		body: JSON.stringify({ accountId, event }),
	});
	if (!response.ok) throw notConfigured("The bus is not configured.");
	const result = (await response.json()) as { seen: boolean };
	return result.seen;
}

function deadLetter(env: WorkerBindings, queue: string): boolean {
	return typeof env.BUS_DEAD_LETTER === "string" && env.BUS_DEAD_LETTER.length > 0 && queue === env.BUS_DEAD_LETTER;
}

export async function handleBusQueue(batch: BusBatch, env: WorkerBindings): Promise<void> {
	for (const message of batch.messages) {
		const body = message.body;
		if (!isObject(body) || !isNonEmptyString(body.accountId)) throw new Error("The message was rejected.");
		if (deadLetter(env, batch.queue)) await deliver(env, body.accountId, escalation(message.id));
		else {
			if (!isBusRecord(body)) throw new Error("The message was rejected.");
			await deliver(env, body.accountId, body.event);
		}
		message.ack();
	}
}

async function authorized(
	request: Request,
	env: WorkerBindings,
	accountId: string,
	agentId: string,
): Promise<Response | null> {
	if (!env.MACHINE_TOKEN_KEY) return new Response("The machine service is not configured.", { status: 503 });
	const header = request.headers.get("authorization") ?? "";
	const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
	const ok = await verifyMachineToken(env.MACHINE_TOKEN_KEY, token, accountId, agentId);
	if (!ok) return new Response("The token was rejected.", { status: 401 });
	return null;
}

function rejected(): Response {
	return new Response("The message was rejected.", { status: 400 });
}

function notReady(): Response {
	return new Response("The machine service is not configured.", { status: 503 });
}

export async function credentialForMachine(
	env: WorkerBindings,
	accountId: string,
	agentId: string,
	nowMs = Date.now(),
): Promise<MachineTokenDelivery> {
	return machineTokenDelivery(env, accountId, agentId, nowMs);
}

async function handleHeartbeat(request: Request, env: WorkerBindings): Promise<Response> {
	if (request.method !== "POST") return rejected();
	const read = await readAgentBody(request);
	if (!read) return rejected();
	const denied = await authorized(request, env, read.accountId, read.agentId);
	if (denied) return denied;
	if (!env.ACCOUNT_BUS) return notReady();
	const response = await stubFetch(env, read.accountId, "/heartbeat", {
		method: "POST",
		body: JSON.stringify({ accountId: read.accountId, agentId: read.agentId }),
	});
	if (!response.ok) return notReady();
	return Response.json({ ok: true });
}

async function seenTestEvent(accountId: string, eventId: string): Promise<boolean> {
	const events = await workerTestBus().events({ accountId, mode: "account" });
	return events.some((event) => event.id === eventId);
}

function headerValue(request: Request, name: string): string {
	return request.headers.get(name) ?? "";
}

function eventFromRaw(raw: string): ReturnType<typeof changeEvent> {
	try {
		return changeEvent(JSON.parse(raw) as unknown);
	} catch {
		return null;
	}
}

function unverifiedMonitorId(raw: string): string {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isObject(parsed) || !isObject(parsed.data) || !isObject(parsed.data.change)) return "";
		const id = parsed.data.change.monitor_id;
		return isNonEmptyString(id) ? id : "";
	} catch {
		return "";
	}
}

function monitorIdOf(event: PublishedEvent): string {
	const value = event.payload.monitorId;
	return typeof value === "string" ? value : "";
}

async function accountForChange(
	request: Request,
	env: WorkerBindings,
	event: PublishedEvent,
	secretAccountId: string,
): Promise<string | null> {
	const mapped = await resolveMonitor(monitorIdOf(event), env);
	if (mapped !== null && mapped !== secretAccountId) return null;
	const claimed = new URL(request.url).searchParams.get("account");
	if (claimed && claimed !== secretAccountId) return null;
	return secretAccountId;
}

async function verifiedChange(
	request: Request,
	env: WorkerBindings,
): Promise<{ accountId: string; event: PublishedEvent } | Response> {
	if (request.method !== "POST") return rejected();
	const raw = await request.text();
	const monitorId = unverifiedMonitorId(raw);
	const stored = await resolveMonitorSecret(monitorId, env);
	const signed = await verifyContextSignature(
		stored?.secret ?? UNKNOWN_MONITOR_SECRET,
		headerValue(request, "x-context-signature"),
		raw,
		env.now?.() ?? Date.now(),
	);
	if (!stored || !signed) return rejected();
	if (headerValue(request, "x-context-event") !== "change.detected") return rejected();
	const event = eventFromRaw(raw);
	if (!event || monitorIdOf(event) !== monitorId) return rejected();
	const contextId = headerValue(request, "x-context-id");
	if (contextId.length > 0 && contextId !== event.id) return rejected();
	const accountId = await accountForChange(request, env, event, stored.accountId);
	if (!accountId) return rejected();
	return { accountId, event };
}

async function storeMonitor(
	env: WorkerBindings,
	accountId: string,
	agentId: string,
	body: Record<string, unknown>,
): Promise<Response> {
	if (!isNonEmptyString(body.monitorId) || !isNonEmptyString(body.secret)) return rejected();
	const saved = await recordMonitorSecret(env, accountId, agentId, body.monitorId, body.secret);
	if (!saved) return rejected();
	return Response.json({ ok: true });
}

async function publishChange(env: WorkerBindings, accountId: string, event: PublishedEvent): Promise<Response> {
	const scope = { accountId, mode: "account" } as const;
	if (chooseAdapters(env.ADAPTERS) !== "real") {
		if (await seenTestEvent(accountId, event.id)) return Response.json({ ok: true, seen: true });
		await workerTestBus().publish(scope, event);
		return Response.json({ ok: true });
	}
	try {
		const seen = await deliver(env, accountId, event);
		return Response.json(seen ? { ok: true, seen: true } : { ok: true });
	} catch {
		return notReady();
	}
}

async function handleChange(request: Request, env: WorkerBindings): Promise<Response> {
	const verified = await verifiedChange(request, env);
	if (verified instanceof Response) return verified;
	return publishChange(env, verified.accountId, verified.event);
}

async function sendMachine(
	env: WorkerBindings,
	accountId: string,
	agentId: string,
	body: Record<string, unknown>,
): Promise<Response> {
	if (!isBusRecord(body)) return rejected();
	if (body.event.from !== agentId) return new Response("The token was rejected.", { status: 401 });
	const scope = { accountId, mode: "account" } as const;
	if (chooseAdapters(env.ADAPTERS) !== "real") {
		await workerTestBus().publish(scope, body.event);
	} else if (!env.BUS_QUEUE) {
		throw notConfigured("The bus is not configured.");
	} else {
		await env.BUS_QUEUE.send({ accountId, event: body.event });
	}
	return Response.json({ ok: true });
}

async function takeMachine(env: WorkerBindings, accountId: string, agentId: string): Promise<Response> {
	const scope = { accountId, mode: "account" } as const;
	if (chooseAdapters(env.ADAPTERS) !== "real") {
		const events = await workerTestBus().events(scope);
		return Response.json(takeTestTask(accountId, agentId, events));
	}
	return stubFetch(env, accountId, "/take", { method: "POST", body: JSON.stringify({ agentId }) });
}

export async function handleMachineRequest(request: Request, env: WorkerBindings): Promise<Response | null> {
	const url = new URL(request.url);
	if (url.pathname === "/machine/heartbeat") return handleHeartbeat(request, env);
	if (url.pathname === "/change.detected") return handleChange(request, env);
	if (url.pathname !== "/machine/send" && url.pathname !== "/machine/take" && url.pathname !== "/machine/monitor") {
		return null;
	}
	if (request.method !== "POST") return rejected();
	const read = await readAgentBody(request);
	if (!read) return rejected();
	const denied = await authorized(request, env, read.accountId, read.agentId);
	if (denied) return denied;
	if (url.pathname === "/machine/monitor") return storeMonitor(env, read.accountId, read.agentId, read.body);
	if (url.pathname === "/machine/send") return sendMachine(env, read.accountId, read.agentId, read.body);
	return takeMachine(env, read.accountId, read.agentId);
}

export function createCloudflareBus(
	namespace: BusNamespace,
	script: readonly ScriptedBusEvent[] = [],
	queue?: QueueProducer,
): AccountEventBus {
	const env = { ADAPTERS: "real", ACCOUNT_BUS: namespace, BUS_QUEUE: queue } satisfies WorkerBindings;

	async function publish(scope: AccountScope, event: PublishedEvent): Promise<void> {
		if (queue) {
			await queue.send({ accountId: scope.accountId, event });
			return;
		}
		await deliver(env, scope.accountId, event);
	}

	return {
		async events(scope) {
			const response = await stubFetch(env, scope.accountId, "/events", {
				headers: { "x-account-id": scope.accountId },
			});
			if (!response.ok) throw notConfigured("The bus is not configured.");
			return (await response.json()) as PublishedEvent[];
		},
		async store(scope) {
			const response = await stubFetch(env, scope.accountId, "/store", {
				headers: { "x-account-id": scope.accountId },
			});
			if (!response.ok) throw notConfigured("The bus is not configured.");
			return (await response.json()) as Record<string, unknown>;
		},
		publish,
		async nextEvent(scope, deadlineAt) {
			const response = await stubFetch(env, scope.accountId, "/advance", {
				method: "POST",
				body: JSON.stringify({
					accountId: scope.accountId,
					script,
					...(typeof deadlineAt === "number" && Number.isFinite(deadlineAt) ? { deadlineAt } : {}),
				}),
			});
			if (!response.ok) throw notConfigured("The bus is not configured.");
			const result = (await response.json()) as { accepted?: boolean; expired?: boolean; event?: PublishedEvent };
			if (result.expired === true) throw new Error("The workspace write did not finish.");
			if (result.accepted !== true || result.event === undefined) return undefined;
			return result.event;
		},
	};
}
