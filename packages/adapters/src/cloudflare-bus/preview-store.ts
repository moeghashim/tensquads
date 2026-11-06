import type { BusStorage } from "./account-bus.ts";

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

// Preview bytes live on the account's bus object. This route does not open the database
// and does not claim the account row or the sequence.
export async function servePreview(storage: BusStorage, request: Request): Promise<Response> {
	const taskId = new URL(request.url).searchParams.get("task") ?? "";
	if (!SLUG.test(taskId)) return new Response("The message was rejected.", { status: 400 });
	const accountId = request.headers.get("x-account-id") ?? "";
	const owner = await storage.get<string>("account");
	if (owner && owner !== accountId) return new Response("The message was rejected.", { status: 400 });
	const key = `preview:${taskId}`;
	if (request.method === "GET") {
		const stored = await storage.get<Uint8Array>(key);
		if (!(stored instanceof Uint8Array)) return new Response("missing", { status: 404 });
		return new Response(stored.slice(), { headers: { "content-type": "text/html; charset=utf-8" } });
	}
	if (request.method !== "PUT") return new Response("The message was rejected.", { status: 400 });
	await storage.put(key, new Uint8Array(await request.arrayBuffer()));
	return Response.json({ ok: true });
}
