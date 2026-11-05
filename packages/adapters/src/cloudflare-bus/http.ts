import { planNextEvent, type TrafficCursor } from "@tensquads/domain";
import type { AccountEventBus, AccountScope, PublishedEvent } from "@tensquads/kernel";
import { MachineFault } from "@tensquads/kernel";

import { chooseAdapters } from "../adapter-choice.ts";
import type { ScriptedBusEvent } from "../memory-bus.ts";
import { traceFor } from "../trace.ts";
import { takeTestTask, workerTestBus } from "../worker-adapters.ts";
import { isBusRecord, isNonEmptyString, isObject } from "./message.ts";
import { verifyMachineToken } from "./token.ts";

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

const opened: TrafficCursor = { seq: 100, clock: 11 * 60 + 2, scriptIndex: 0 };

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

export async function handleMachineRequest(request: Request, env: WorkerBindings): Promise<Response | null> {
	const url = new URL(request.url);
	if (url.pathname !== "/machine/send" && url.pathname !== "/machine/take") return null;
	const body: unknown = await request.json().catch(() => null);
	if (!isObject(body) || !isNonEmptyString(body.accountId) || !isNonEmptyString(body.agentId)) {
		return new Response("The message was rejected.", { status: 400 });
	}
	const accountId = body.accountId;
	const agentId = body.agentId;
	const rejected = await authorized(request, env, accountId, agentId);
	if (rejected) return rejected;
	const scope = { accountId, mode: "account" } as const;
	if (url.pathname === "/machine/send") {
		if (!isBusRecord(body)) return new Response("The message was rejected.", { status: 400 });
		if (body.event.from !== agentId) return new Response("The token was rejected.", { status: 401 });
		if (chooseAdapters(env.ADAPTERS) !== "real") {
			await workerTestBus().publish(scope, body.event);
		} else if (!env.BUS_QUEUE) {
			throw notConfigured("The bus is not configured.");
		} else {
			await env.BUS_QUEUE.send({ accountId, event: body.event });
		}
		return Response.json({ ok: true });
	}
	if (chooseAdapters(env.ADAPTERS) !== "real") {
		const events = await workerTestBus().events(scope);
		return Response.json(takeTestTask(accountId, agentId, events));
	}
	return stubFetch(env, accountId, "/take", { method: "POST", body: JSON.stringify({ agentId }) });
}

export function createCloudflareBus(
	namespace: BusNamespace,
	script: readonly ScriptedBusEvent[] = [],
	queue?: QueueProducer,
): AccountEventBus {
	const cursors = new Map<string, TrafficCursor>();
	const advancing = new Map<string, Promise<void>>();
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
		async nextEvent(scope) {
			const next = (advancing.get(scope.accountId) ?? Promise.resolve()).then(async () => {
				let current = cursors.get(scope.accountId) ?? opened;
				const existing = await this.events(scope);
				const ids = new Set(existing.map((event) => event.id));
				while (ids.has(`e${current.seq}`)) {
					current = { seq: current.seq + 1, clock: current.clock + 1, scriptIndex: current.scriptIndex + 1 };
				}
				const plan = planNextEvent(existing, script, current, traceFor);
				if (!plan) return undefined;
				if (queue) {
					await queue.send({ accountId: scope.accountId, event: plan.event });
					cursors.set(scope.accountId, plan.cursor);
					return plan.event;
				}
				const seen = await deliver(env, scope.accountId, plan.event);
				if (seen) return undefined;
				cursors.set(scope.accountId, plan.cursor);
				return plan.event;
			});
			const tail = next.then(
				() => undefined,
				() => undefined,
			);
			advancing.set(scope.accountId, tail);
			try {
				return await next;
			} finally {
				if (advancing.get(scope.accountId) === tail) advancing.delete(scope.accountId);
			}
		},
	};
}
