import { chooseAdapters } from "../adapter-choice.ts";
import type { WorkerBindings } from "./http.ts";
import { isNonEmptyString, isObject } from "./message.ts";
import { createPagesClient, type PagesClient, PagesFailure } from "./pages-client.ts";
import { verifyMachineToken } from "./token.ts";

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

function rejected(): Response {
	return new Response("The message was rejected.", { status: 400 });
}

function notReady(): Response {
	return new Response("The machine service is not configured.", { status: 503 });
}

function missing(): Response {
	return new Response(null, { status: 404 });
}

function real(env: WorkerBindings): boolean {
	return chooseAdapters(env.ADAPTERS) === "real";
}

async function authorized(
	request: Request,
	env: WorkerBindings,
	accountId: string,
	agentId: string,
): Promise<Response | null> {
	if (!env.MACHINE_TOKEN_KEY) return notReady();
	const header = request.headers.get("authorization") ?? "";
	const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
	const ok = await verifyMachineToken(env.MACHINE_TOKEN_KEY, token, accountId, agentId);
	if (!ok) return new Response("The token was rejected.", { status: 401 });
	return null;
}

async function covered(mandate: unknown, html: string): Promise<boolean> {
	const live = await import("./publish-live.ts");
	return live.publishCovered(mandate, html);
}

function pagesFor(env: WorkerBindings): PagesClient {
	if (env.pages) return env.pages;
	const token = env.CLOUDFLARE_PAGES_API_TOKEN;
	if (!token) throw new PagesFailure(503, "The machine service is not configured.");
	return createPagesClient({ token });
}

export async function handlePublishRoutes(request: Request, env: WorkerBindings): Promise<Response | null> {
	const url = new URL(request.url);
	if (url.pathname === "/machine/preview") return storePreview(request, env, url);
	if (url.pathname === "/machine/publish") return publish(request, env);
	if (url.pathname.startsWith("/preview/")) return showPreview(request, env, url);
	return null;
}

async function storePreview(request: Request, env: WorkerBindings, url: URL): Promise<Response> {
	if (!real(env)) return missing();
	if (request.method !== "POST") return rejected();
	const body: unknown = await request.json().catch(() => null);
	if (!isObject(body) || !isNonEmptyString(body.accountId) || !isNonEmptyString(body.agentId)) return rejected();
	const denied = await authorized(request, env, body.accountId, body.agentId);
	if (denied) return denied;
	if (!SLUG.test(body.accountId) || typeof body.taskId !== "string" || !SLUG.test(body.taskId)) return rejected();
	if (typeof body.html !== "string") return rejected();
	const namespace = env.ACCOUNT_BUS;
	if (!namespace) return notReady();
	const stored = await namespace
		.get(namespace.idFromName(body.accountId))
		.fetch(`https://bus/preview?task=${encodeURIComponent(body.taskId)}`, {
			method: "PUT",
			headers: { "x-account-id": body.accountId },
			body: body.html,
		});
	if (stored.status === 400) return rejected();
	if (!stored.ok) return notReady();
	return Response.json({ previewUrl: `${url.origin}/preview/${body.accountId}/${body.taskId}` });
}

async function showPreview(request: Request, env: WorkerBindings, url: URL): Promise<Response> {
	if (!real(env)) return missing();
	if (request.method !== "GET") return missing();
	const parts = url.pathname.split("/");
	if (parts.length !== 4) return rejected();
	const accountId = parts[2] ?? "";
	const taskId = parts[3] ?? "";
	if (!SLUG.test(accountId) || !SLUG.test(taskId)) return rejected();
	const namespace = env.ACCOUNT_BUS;
	if (!namespace) return notReady();
	const stored = await namespace
		.get(namespace.idFromName(accountId))
		.fetch(`https://bus/preview?task=${encodeURIComponent(taskId)}`, {
			method: "GET",
			headers: { "x-account-id": accountId },
		});
	if (stored.status === 404) return new Response(null, { status: 404 });
	if (!stored.ok) return notReady();
	return new Response(await stored.arrayBuffer(), {
		status: 200,
		headers: { "content-type": "text/html; charset=utf-8" },
	});
}

async function publish(request: Request, env: WorkerBindings): Promise<Response> {
	if (!real(env)) return missing();
	if (request.method !== "POST") return rejected();
	const body: unknown = await request.json().catch(() => null);
	if (!isObject(body) || !isNonEmptyString(body.accountId) || !isNonEmptyString(body.agentId)) return rejected();
	const denied = await authorized(request, env, body.accountId, body.agentId);
	if (denied) return denied;
	if (
		!SLUG.test(body.accountId) ||
		typeof body.slug !== "string" ||
		!SLUG.test(body.slug) ||
		body.slug !== body.accountId
	) {
		return rejected();
	}
	if (!isNonEmptyString(body.taskId) || typeof body.html !== "string") return rejected();
	if (!(await covered(body.mandate, body.html))) return rejected();
	try {
		const liveUrl = await pagesFor(env).publish(body.slug, body.html);
		return Response.json({ liveUrl });
	} catch (error) {
		if (error instanceof PagesFailure) return new Response(error.message, { status: error.status });
		return new Response("The page was not uploaded.", { status: 502 });
	}
}
