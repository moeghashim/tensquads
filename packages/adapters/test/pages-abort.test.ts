import assert from "node:assert/strict";
import test from "node:test";

import { createPagesClient, PagesFailure } from "../src/cloudflare-bus/pages-client.ts";

const TIMEOUT = "The Cloudflare request timed out.";

function guard(): () => void {
	const prior = globalThis.fetch;
	globalThis.fetch = () => Promise.reject(new Error("The test called the network."));
	return () => {
		globalThis.fetch = prior;
	};
}

function hang(signal: AbortSignal | null | undefined): Promise<Response> {
	return new Promise((_resolve, reject) => {
		if (!signal) return;
		const fail = () => reject(new DOMException("The operation was aborted.", "AbortError"));
		if (signal.aborted) {
			fail();
			return;
		}
		signal.addEventListener("abort", fail, { once: true });
	});
}

function json(result: unknown): Response {
	return Response.json({ success: true, errors: [], messages: [], result });
}

function api(url: string, method: string): Response {
	if (method === "GET" && url.endsWith("/pages/projects/ts-proof")) return json({ name: "ts-proof" });
	if (url.endsWith("/upload-token")) return json({ jwt: "upload-jwt" });
	if (url.endsWith("/check-missing")) return json([]);
	if (url.endsWith("/upsert-hashes")) return json([]);
	if (url.endsWith("/deployments")) return json({ id: "dep" });
	if (method === "POST" && url.endsWith("/domains")) return json({ status: "active", zone_tag: "zone" });
	if (method === "GET" && url.includes("/dns_records")) {
		return json([{ type: "CNAME", name: "proof.10squads.com", content: "ts-proof.pages.dev", proxied: true }]);
	}
	if (method === "GET" && url.endsWith("/domains/proof.10squads.com")) return json({ status: "active" });
	throw new Error(`unexpected ${method} ${url}`);
}

async function rejectsPromptly(run: () => Promise<unknown>): Promise<void> {
	const started = Date.now();
	await assert.rejects(run, (error: unknown) => {
		assert.ok(error instanceof PagesFailure);
		assert.equal(error.message, TIMEOUT);
		return true;
	});
	assert.ok(Date.now() - started < 500);
}

test("a stalled Cloudflare fetch aborts at the deadline", { timeout: 1_000 }, async () => {
	const restore = guard();
	try {
		const fetchImpl: typeof fetch = (_input, init) => hang(init?.signal ?? null);
		const client = createPagesClient({ token: "pages-token", fetch: fetchImpl, deadlineMs: 1, pollMs: 60_000 });
		await rejectsPromptly(() => client.publish("proof", "<p>Proof</p>"));
	} finally {
		restore();
	}
});

test("a stalled live check aborts at the deadline", { timeout: 1_000 }, async () => {
	const restore = guard();
	try {
		const fetchImpl: typeof fetch = (input, init) => {
			const url = String(input);
			if (url === "https://proof.10squads.com/") return hang(init?.signal ?? null);
			return Promise.resolve(api(url, init?.method ?? "GET"));
		};
		const client = createPagesClient({ token: "pages-token", fetch: fetchImpl, deadlineMs: 1, pollMs: 60_000 });
		await rejectsPromptly(() => client.publish("proof", "<p>Proof</p>"));
	} finally {
		restore();
	}
});
