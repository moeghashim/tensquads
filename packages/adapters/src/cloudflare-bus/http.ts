import { planNextEvent, type TrafficCursor } from "@tensquads/domain";
import type { AccountEventBus, AccountScope, PublishedEvent } from "@tensquads/kernel";
import { MachineFault } from "@tensquads/kernel";

import { chooseAdapters } from "../adapter-choice.ts";
import type { ScriptedBusEvent } from "../memory-bus.ts";
import { traceFor } from "../trace.ts";
import { takeTestTask, workerTestBus } from "../worker-adapters.ts";
import { verifyMachineToken } from "./token.ts";

export interface BusNamespace {
	idFromName(name: string): unknown;
	get(id: unknown): { fetch(input: Request | string | URL, init?: RequestInit): Promise<Response> };
}

export interface WorkerBindings {
	readonly ADAPTERS?: string;
	readonly MACHINE_TOKEN_KEY?: string;
	readonly ACCOUNT_BUS?: BusNamespace;
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

async function deliver(env: WorkerBindings, accountId: string, event: PublishedEvent): Promise<void> {
	if (chooseAdapters(env.ADAPTERS) !== "real") {
		await workerTestBus().publish({ accountId, mode: "account" }, event);
		return;
	}
	const response = await stubFetch(env, accountId, "/accept", {
		method: "POST",
		body: JSON.stringify({ accountId, event }),
	});
	if (!response.ok) throw notConfigured("The bus is not configured.");
}

export async function handleBusQueue(batch: BusBatch, env: WorkerBindings): Promise<void> {
	for (const message of batch.messages) {
		const body = message.body as { accountId?: string; event?: PublishedEvent };
		if (body.accountId && batch.queue === "tensquads-bus-dlq")
			await deliver(env, body.accountId, escalation(message.id));
		else if (body.accountId && body.event) await deliver(env, body.accountId, body.event);
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
	const body = (await request.json()) as { accountId?: string; agentId?: string; event?: PublishedEvent };
	const accountId = body.accountId ?? "";
	const agentId = body.agentId ?? "";
	const rejected = await authorized(request, env, accountId, agentId);
	if (rejected) return rejected;
	const scope = { accountId, mode: "account" } as const;
	if (url.pathname === "/machine/send") {
		if (!body.event) return new Response("The bus is not configured.", { status: 503 });
		await deliver(env, accountId, body.event);
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
): AccountEventBus {
	const cursors = new Map<string, TrafficCursor>();
	const env = { ADAPTERS: "real", ACCOUNT_BUS: namespace } satisfies WorkerBindings;

	async function publish(scope: AccountScope, event: PublishedEvent): Promise<void> {
		await deliver(env, scope.accountId, event);
	}

	return {
		async events(scope) {
			const response = await stubFetch(env, scope.accountId, "/events");
			if (!response.ok) throw notConfigured("The bus is not configured.");
			return (await response.json()) as PublishedEvent[];
		},
		async store(scope) {
			const response = await stubFetch(env, scope.accountId, "/store");
			if (!response.ok) throw notConfigured("The bus is not configured.");
			return (await response.json()) as Record<string, unknown>;
		},
		publish,
		async nextEvent(scope) {
			const current = cursors.get(scope.accountId) ?? opened;
			const existing = await this.events(scope);
			const plan = planNextEvent(existing, script, current, traceFor);
			if (!plan) return undefined;
			cursors.set(scope.accountId, plan.cursor);
			await publish(scope, plan.event);
			return plan.event;
		},
	};
}
