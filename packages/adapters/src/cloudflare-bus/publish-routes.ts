import { chooseAdapters } from "../adapter-choice.ts";
import type { WorkerBindings } from "./http.ts";
import { rejectMachine } from "./machine-auth.ts";
import { isNonEmptyString, isObject } from "./message.ts";
import { createPagesClient, type PagesClient, PagesFailure } from "./pages-client.ts";
import { connectPublishDirectory, type PublishDirectory } from "./publish-directory.ts";

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const PREVIEW_CSP =
	"sandbox allow-scripts allow-popups; default-src 'self' 'unsafe-inline' data: https:; frame-ancestors 'none'";

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

function previewHead(body: ArrayBuffer | string | null, status: number, html = false): Response {
	const headers = new Headers({
		"content-security-policy": PREVIEW_CSP,
		"x-content-type-options": "nosniff",
		"referrer-policy": "no-referrer",
		"cache-control": "no-store",
	});
	if (html) headers.set("content-type", "text/html; charset=utf-8");
	return new Response(body, { status, headers });
}

function real(env: WorkerBindings): boolean {
	return chooseAdapters(env.ADAPTERS) === "real";
}

function directoryOf(env: WorkerBindings): PublishDirectory | Response {
	if (env.publishDirectory) return env.publishDirectory;
	if (!env.DATABASE_URL) return notReady();
	return connectPublishDirectory(env.DATABASE_URL);
}

async function covered(stored: unknown, html: string): Promise<boolean> {
	const loaded = (await import("./publish-live.ts")) as {
		publishCovered?: (stored: unknown, html: string) => boolean;
		default?: (stored: unknown, html: string) => boolean;
	};
	const check = loaded.publishCovered ?? loaded.default;
	if (!check) return false;
	return check(stored, html);
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

async function requireWebsite(
	directory: PublishDirectory,
	accountId: string,
	agentId: string,
): Promise<Response | null> {
	try {
		if (await directory.isWebsiteAgent(accountId, agentId)) return null;
		return new Response("The agent was rejected.", { status: 403 });
	} catch {
		return notReady();
	}
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

async function openWebsite(
	env: WorkerBindings,
	accountId: string,
	agentId: string,
): Promise<PublishDirectory | Response> {
	const directory = directoryOf(env);
	if (directory instanceof Response) return directory;
	const denied = await requireWebsite(directory, accountId, agentId);
	if (denied) return denied;
	return directory;
}

async function storePreview(request: Request, env: WorkerBindings, url: URL): Promise<Response> {
	if (!real(env)) return new Response(null, { status: 404 });
	const read = await actor(request, env);
	if (read instanceof Response) return read;
	const ids = previewIds(read.body);
	if (!ids) return rejected();
	const directory = await openWebsite(env, read.accountId, read.agentId);
	if (directory instanceof Response) return directory;
	const stored = await busPreview(env, ids.accountId, ids.taskId, { method: "PUT", body: ids.html });
	if (stored.status === 400) return rejected();
	if (!stored.ok) return notReady();
	return Response.json({ previewUrl: `${url.origin}/preview/${ids.accountId}/${ids.taskId}` });
}

async function showPreview(request: Request, env: WorkerBindings, url: URL): Promise<Response> {
	if (!real(env)) return previewHead(null, 404);
	if (request.method !== "GET") return previewHead(null, 404);
	const ids = previewPath(url.pathname);
	if (!ids) return previewHead("The message was rejected.", 400);
	const stored = await busPreview(env, ids.accountId, ids.taskId, { method: "GET" });
	if (stored.status === 404) return previewHead(null, 404);
	if (!stored.ok) return previewHead("The machine service is not configured.", 503);
	return previewHead(await stored.arrayBuffer(), 200, true);
}

async function publish(request: Request, env: WorkerBindings): Promise<Response> {
	if (!real(env)) return new Response(null, { status: 404 });
	const read = await actor(request, env);
	if (read instanceof Response) return read;
	const ids = publishIds(read.body);
	if (!ids) return rejected();
	const directory = await openWebsite(env, read.accountId, read.agentId);
	if (directory instanceof Response) return directory;
	try {
		const stored = await directory.storedPublish(read.accountId, ids.taskId, ids.slug, env.now?.() ?? Date.now());
		if (!stored || stored.slug !== ids.slug) return rejected();
		if (!(await covered(stored.mandate, ids.html))) return rejected();
	} catch (error) {
		if (error instanceof PagesFailure) return new Response(error.message, { status: error.status });
		return notReady();
	}
	try {
		const liveUrl = await pagesFor(env).publish(ids.slug, ids.html);
		return Response.json({ liveUrl });
	} catch (error) {
		if (error instanceof PagesFailure) return new Response(error.message, { status: error.status });
		return new Response("The page was not uploaded.", { status: 502 });
	}
}
