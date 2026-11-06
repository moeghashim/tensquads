import { chooseAdapters } from "../adapter-choice.ts";
import type { WorkerBindings } from "./http.ts";
import { rejectMachine } from "./machine-auth.ts";
import { isNonEmptyString, isObject } from "./message.ts";
import { createPagesClient, type PagesClient, PagesFailure } from "./pages-client.ts";

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

interface Actor {
	readonly accountId: string;
	readonly agentId: string;
	readonly body: Record<string, unknown>;
}

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

async function covered(mandate: unknown, html: string): Promise<boolean> {
	const loaded = await import("./publish-live.ts");
	const check = loaded.publishCovered ?? (loaded as { default?: typeof loaded.publishCovered }).default;
	if (!check) return false;
	return check(mandate, html);
}

function pagesFor(env: WorkerBindings): PagesClient {
	if (env.pages) return env.pages;
	const token = env.CLOUDFLARE_PAGES_API_TOKEN;
	if (!token) throw new PagesFailure(503, "The machine service is not configured.");
	return createPagesClient({ token });
}

async function actor(request: Request, env: WorkerBindings): Promise<Actor | Response> {
	if (request.method !== "POST") return rejected();
	const body: unknown = await request.json().catch(() => null);
	if (!isObject(body) || !isNonEmptyString(body.accountId) || !isNonEmptyString(body.agentId)) return rejected();
	const denied = await rejectMachine(request, env, body.accountId, body.agentId);
	if (denied) return denied;
	return { accountId: body.accountId, agentId: body.agentId, body };
}

function previewIds(body: Record<string, unknown>): { accountId: string; taskId: string; html: string } | null {
	if (!SLUG.test(String(body.accountId)) || typeof body.taskId !== "string" || !SLUG.test(body.taskId)) return null;
	if (typeof body.html !== "string") return null;
	return { accountId: String(body.accountId), taskId: body.taskId, html: body.html };
}

function publishIds(body: Record<string, unknown>): { slug: string; taskId: string; html: string } | null {
	if (typeof body.slug !== "string" || !SLUG.test(body.slug) || body.slug !== body.accountId) return null;
	if (!isNonEmptyString(body.taskId) || typeof body.html !== "string") return null;
	return { slug: body.slug, taskId: body.taskId, html: body.html };
}

function previewPath(pathname: string): { accountId: string; taskId: string } | null {
	const parts = pathname.split("/");
	if (parts.length !== 4) return null;
	const accountId = parts[2] ?? "";
	const taskId = parts[3] ?? "";
	if (!SLUG.test(accountId) || !SLUG.test(taskId)) return null;
	return { accountId, taskId };
}

async function busPreview(
	env: WorkerBindings,
	accountId: string,
	taskId: string,
	init: RequestInit,
): Promise<Response> {
	const namespace = env.ACCOUNT_BUS;
	if (!namespace) return notReady();
	return namespace
		.get(namespace.idFromName(accountId))
		.fetch(`https://bus/preview?task=${encodeURIComponent(taskId)}`, {
			...init,
			headers: { "x-account-id": accountId },
		});
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
	const read = await actor(request, env);
	if (read instanceof Response) return read;
	const ids = previewIds(read.body);
	if (!ids) return rejected();
	const stored = await busPreview(env, ids.accountId, ids.taskId, { method: "PUT", body: ids.html });
	if (stored.status === 400) return rejected();
	if (!stored.ok) return notReady();
	return Response.json({ previewUrl: `${url.origin}/preview/${ids.accountId}/${ids.taskId}` });
}

async function showPreview(request: Request, env: WorkerBindings, url: URL): Promise<Response> {
	if (!real(env)) return missing();
	if (request.method !== "GET") return missing();
	const ids = previewPath(url.pathname);
	if (!ids) return rejected();
	const stored = await busPreview(env, ids.accountId, ids.taskId, { method: "GET" });
	if (stored.status === 404) return new Response(null, { status: 404 });
	if (!stored.ok) return notReady();
	return new Response(await stored.arrayBuffer(), {
		status: 200,
		headers: { "content-type": "text/html; charset=utf-8" },
	});
}

async function publish(request: Request, env: WorkerBindings): Promise<Response> {
	if (!real(env)) return missing();
	const read = await actor(request, env);
	if (read instanceof Response) return read;
	const ids = publishIds(read.body);
	if (!ids) return rejected();
	if (!(await covered(read.body.mandate, ids.html))) return rejected();
	try {
		const liveUrl = await pagesFor(env).publish(ids.slug, ids.html);
		return Response.json({ liveUrl });
	} catch (error) {
		if (error instanceof PagesFailure) return new Response(error.message, { status: error.status });
		return new Response("The page was not uploaded.", { status: 502 });
	}
}
