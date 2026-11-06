import type { BusBatch, BusNamespace, WorkerBindings } from "../src/cloudflare-bus/index.ts";
import { AccountBus, createCloudflareBus, handleBusQueue, handleMachineRequest } from "../src/cloudflare-bus/index.ts";
import type { ScriptedBusEvent } from "../src/memory-bus.ts";

export { AccountBus };

type Handler = (request: Request, env: WorkerBindings, url: URL) => Promise<Response>;

function configured(namespace: BusNamespace | undefined): BusNamespace | Response {
	if (!namespace) return new Response("The bus is not configured.", { status: 503 });
	return namespace;
}

function stubFetch(namespace: BusNamespace, accountId: string, path: string, init?: RequestInit): Promise<Response> {
	return namespace.get(namespace.idFromName(accountId)).fetch(`https://bus${path}`, init);
}

const queueRoute: Handler = async (request, env) => {
	const body = (await request.json()) as { queue: string; messages: { id: string; body: unknown }[] };
	await handleBusQueue(
		{
			queue: body.queue,
			messages: body.messages.map((message) => ({
				...message,
				ack() {
					return undefined;
				},
			})),
		},
		env,
	);
	return new Response("ok");
};

const publishRoute: Handler = async (request, env) => {
	const body = (await request.json()) as { accountId: string };
	const namespace = configured(env.ACCOUNT_BUS);
	if (namespace instanceof Response) return namespace;
	return stubFetch(namespace, body.accountId, "/accept", { method: "POST", body: JSON.stringify(body) });
};

const passRoute: Handler = async (request, env, url) => {
	const namespace = configured(env.ACCOUNT_BUS);
	if (namespace instanceof Response) return namespace;
	return stubFetch(namespace, url.searchParams.get("account") ?? "", url.pathname, {
		method: request.method,
		body: request.method === "GET" ? undefined : await request.text(),
	});
};

const readRoute: Handler = async (_request, env, url) => {
	const namespace = configured(env.ACCOUNT_BUS);
	if (namespace instanceof Response) return namespace;
	return stubFetch(namespace, url.searchParams.get("account") ?? "", url.searchParams.get("path") ?? "/local-events");
};

const nextRoute: Handler = async (request, env) => {
	const body = (await request.json()) as { accountId: string; script: ScriptedBusEvent[] };
	const namespace = configured(env.ACCOUNT_BUS);
	if (namespace instanceof Response) return namespace;
	const bus = createCloudflareBus(namespace, body.script);
	const event = await bus.nextEvent({ accountId: body.accountId, mode: "account" });
	return Response.json(event ?? null);
};

const socketRoute: Handler = async (_request, env, url) => {
	const namespace = configured(env.ACCOUNT_BUS);
	if (namespace instanceof Response) return namespace;
	const inbound = new Request("https://bus/socket", { headers: { Upgrade: "websocket" } });
	return namespace.get(namespace.idFromName(url.searchParams.get("account") ?? "")).fetch(inbound);
};

const routes = new Map<string, Handler>([
	["/queue", queueRoute],
	["/publish", publishRoute],
	["/alarm", passRoute],
	["/probe-delivery", passRoute],
	["/read", readRoute],
	["/next", nextRoute],
	["/socket", socketRoute],
]);

export default {
	async fetch(request: Request, env: WorkerBindings): Promise<Response> {
		const url = new URL(request.url);
		const route = routes.get(url.pathname);
		if (route) return route(request, env, url);
		const handled = await handleMachineRequest(request, env);
		if (handled) return handled;
		if (url.pathname === "/") return new Response("tensquads homepage");
		return new Response("missing", { status: 404 });
	},
	queue(batch: BusBatch, env: WorkerBindings): Promise<void> {
		return handleBusQueue(batch, env);
	},
};
