import type { BusBatch, WorkerBindings } from "../src/cloudflare-bus/index.ts";
import { AccountBus, createCloudflareBus, handleBusQueue, handleMachineRequest } from "../src/cloudflare-bus/index.ts";
import type { ScriptedBusEvent } from "../src/memory-bus.ts";

export { AccountBus };

export default {
	async fetch(request: Request, env: WorkerBindings): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/queue") {
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
		}
		if (url.pathname === "/publish") {
			const body = (await request.json()) as { accountId: string };
			const namespace = env.ACCOUNT_BUS;
			if (!namespace) return new Response("The bus is not configured.", { status: 503 });
			return namespace.get(namespace.idFromName(body.accountId)).fetch("https://bus/accept", {
				method: "POST",
				body: JSON.stringify(body),
			});
		}
		if (url.pathname === "/read") {
			const accountId = url.searchParams.get("account") ?? "";
			const path = url.searchParams.get("path") ?? "/local-events";
			const namespace = env.ACCOUNT_BUS;
			if (!namespace) return new Response("The bus is not configured.", { status: 503 });
			return namespace.get(namespace.idFromName(accountId)).fetch(`https://bus${path}`);
		}
		if (url.pathname === "/next") {
			const body = (await request.json()) as { accountId: string; script: ScriptedBusEvent[] };
			const namespace = env.ACCOUNT_BUS;
			if (!namespace) return new Response("The bus is not configured.", { status: 503 });
			const bus = createCloudflareBus(namespace, body.script);
			const event = await bus.nextEvent({ accountId: body.accountId, mode: "account" });
			return Response.json(event ?? null);
		}
		if (url.pathname === "/socket") {
			const accountId = url.searchParams.get("account") ?? "";
			const namespace = env.ACCOUNT_BUS;
			if (!namespace) return new Response("The bus is not configured.", { status: 503 });
			const inbound = new Request("https://bus/socket", { headers: { Upgrade: "websocket" } });
			return namespace.get(namespace.idFromName(accountId)).fetch(inbound);
		}
		const handled = await handleMachineRequest(request, env);
		if (handled) return handled;
		if (url.pathname === "/") return new Response("tensquads homepage");
		return new Response("missing", { status: 404 });
	},
	queue(batch: BusBatch, env: WorkerBindings): Promise<void> {
		return handleBusQueue(batch, env);
	},
};
