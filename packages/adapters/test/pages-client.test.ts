import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
	createPagesClient,
	DOMAIN_POLL_MS,
	DOMAIN_WAIT_MS,
	PAGES_ACCOUNT_ID,
	PagesFailure,
	pagesAssetHash,
} from "../src/cloudflare-bus/pages-client.ts";

const API = "https://api.cloudflare.com/client/v4";
const TOKEN = "pages-token";
const ZONE = "zone-10squads";
const HTML = "<!doctype html><title>Café 東京</title>";

interface Seen {
	readonly method: string;
	readonly url: string;
	readonly authorization: string;
	readonly body: string;
	readonly manifest: string;
}

function json(result: unknown, status = 200): Response {
	return Response.json({ success: status < 300, errors: [], messages: [], result }, { status });
}

function recorder(handle: (seen: Seen) => Response | Promise<Response>) {
	const calls: Seen[] = [];
	const fetchImpl: typeof fetch = async (input, init) => {
		const request = new Request(input, init);
		const type = request.headers.get("content-type") ?? "";
		let body = "";
		let manifest = "";
		if (type.includes("multipart/form-data")) {
			const field = (await request.formData()).get("manifest");
			manifest = typeof field === "string" ? field : field ? await field.text() : "";
		} else body = await request.text();
		const seen: Seen = {
			method: request.method,
			url: request.url,
			authorization: request.headers.get("authorization") ?? "",
			body,
			manifest,
		};
		calls.push(seen);
		return handle(seen);
	};
	return { calls, fetchImpl };
}

function guard(): () => void {
	const prior = globalThis.fetch;
	globalThis.fetch = () => Promise.reject(new Error("The test called the network."));
	return () => {
		globalThis.fetch = prior;
	};
}

function clientFor(
	fetchImpl: typeof fetch,
	options: { deadlineMs?: number; pollMs?: number; clock?: { at: number }; sleeps?: number[] } = {},
) {
	const clock = options.clock ?? { at: 1_000 };
	const sleeps = options.sleeps ?? [];
	return createPagesClient({
		token: TOKEN,
		fetch: fetchImpl,
		now: () => clock.at,
		sleep: async (ms) => {
			sleeps.push(ms);
			clock.at += ms;
		},
		deadlineMs: options.deadlineMs,
		pollMs: options.pollMs,
	});
}

test("the Pages asset hash is blake3 of the base64 contents and the extension", () => {
	const hash = pagesAssetHash(new TextEncoder().encode("foobar"), "png");
	assert.equal(hash, "2082190357cfd3617ccfe04f340c6247");
	assert.equal(pagesAssetHash(new TextEncoder().encode("foobar"), "html") === hash, false);
});

test("the Pages account id is the account in wrangler.jsonc", () => {
	const source = readFileSync(new URL("../../../apps/web/wrangler.jsonc", import.meta.url), "utf8");
	assert.equal(/"account_id"\s*:\s*"([0-9a-f]+)"/.exec(source)?.[1], PAGES_ACCOUNT_ID);
	assert.equal(DOMAIN_WAIT_MS, 120_000);
	assert.equal(DOMAIN_POLL_MS, 2_000);
});

test("publish creates the project, uploads the page, and waits for the domain", { timeout: 2_000 }, async () => {
	const restore = guard();
	try {
		const hash = pagesAssetHash(new TextEncoder().encode(HTML), "html");
		const base64 = Buffer.from(HTML, "utf8").toString("base64");
		let domainGets = 0;
		const sleeps: number[] = [];
		const { calls, fetchImpl } = recorder((seen) => {
			const { method, url } = seen;
			assert.equal(url.includes(TOKEN), false);
			if (method === "GET" && url === `${API}/accounts/${PAGES_ACCOUNT_ID}/pages/projects/ts-proof`) {
				return json(null, 404);
			}
			if (method === "POST" && url === `${API}/accounts/${PAGES_ACCOUNT_ID}/pages/projects`) {
				assert.equal(seen.authorization, `Bearer ${TOKEN}`);
				assert.deepEqual(JSON.parse(seen.body), { name: "ts-proof", production_branch: "main" });
				return json({ name: "ts-proof" });
			}
			if (method === "GET" && url.endsWith("/upload-token")) {
				assert.equal(seen.authorization, `Bearer ${TOKEN}`);
				return json({ jwt: "upload-jwt" });
			}
			if (url === `${API}/pages/assets/check-missing`) {
				assert.equal(seen.authorization, "Bearer upload-jwt");
				assert.deepEqual(JSON.parse(seen.body), { hashes: [hash] });
				return json([hash]);
			}
			if (url === `${API}/pages/assets/upload`) {
				assert.equal(seen.authorization, "Bearer upload-jwt");
				assert.deepEqual(JSON.parse(seen.body), [
					{ key: hash, value: base64, metadata: { contentType: "text/html" }, base64: true },
				]);
				return json({ id: "asset" });
			}
			if (url === `${API}/pages/assets/upsert-hashes`) {
				assert.equal(seen.authorization, "Bearer upload-jwt");
				assert.deepEqual(JSON.parse(seen.body), { hashes: [hash] });
				return json([]);
			}
			if (method === "POST" && url.endsWith("/deployments")) {
				assert.equal(seen.authorization, `Bearer ${TOKEN}`);
				assert.equal(seen.manifest, JSON.stringify({ "/index.html": hash }));
				return json({ id: "dep" });
			}
			if (method === "POST" && url.endsWith("/domains")) {
				assert.deepEqual(JSON.parse(seen.body), { name: "proof.10squads.com" });
				return json({ name: "proof.10squads.com", status: "pending", zone_tag: ZONE });
			}
			if (url === `${API}/zones/${ZONE}/dns_records?type=CNAME&name=proof.10squads.com`) {
				return json([]);
			}
			if (method === "POST" && url === `${API}/zones/${ZONE}/dns_records`) {
				assert.equal(seen.authorization, `Bearer ${TOKEN}`);
				assert.deepEqual(JSON.parse(seen.body), {
					type: "CNAME",
					name: "proof.10squads.com",
					content: "ts-proof.pages.dev",
					proxied: true,
					ttl: 1,
				});
				return json({ id: "rec" });
			}
			if (method === "GET" && url.endsWith("/domains/proof.10squads.com")) {
				domainGets += 1;
				return json({
					name: "proof.10squads.com",
					status: domainGets === 1 ? "pending" : "active",
					zone_tag: ZONE,
				});
			}
			if (url === "https://proof.10squads.com/") {
				assert.equal(seen.authorization, "");
				return new Response(HTML, { status: 200 });
			}
			throw new Error(`unexpected ${method} ${url}`);
		});
		const live = await clientFor(fetchImpl, { sleeps, deadlineMs: DOMAIN_WAIT_MS, pollMs: DOMAIN_POLL_MS }).publish(
			"proof",
			HTML,
		);
		assert.equal(live, "https://proof.10squads.com");
		assert.deepEqual(sleeps, [DOMAIN_POLL_MS]);
		assert.deepEqual(
			calls.map((call) => `${call.method} ${call.url}`),
			[
				`GET ${API}/accounts/${PAGES_ACCOUNT_ID}/pages/projects/ts-proof`,
				`POST ${API}/accounts/${PAGES_ACCOUNT_ID}/pages/projects`,
				`GET ${API}/accounts/${PAGES_ACCOUNT_ID}/pages/projects/ts-proof/upload-token`,
				`POST ${API}/pages/assets/check-missing`,
				`POST ${API}/pages/assets/upload`,
				`POST ${API}/pages/assets/upsert-hashes`,
				`POST ${API}/accounts/${PAGES_ACCOUNT_ID}/pages/projects/ts-proof/deployments`,
				`POST ${API}/accounts/${PAGES_ACCOUNT_ID}/pages/projects/ts-proof/domains`,
				`GET ${API}/zones/${ZONE}/dns_records?type=CNAME&name=proof.10squads.com`,
				`POST ${API}/zones/${ZONE}/dns_records`,
				`GET ${API}/accounts/${PAGES_ACCOUNT_ID}/pages/projects/ts-proof/domains/proof.10squads.com`,
				`GET ${API}/accounts/${PAGES_ACCOUNT_ID}/pages/projects/ts-proof/domains/proof.10squads.com`,
				"GET https://proof.10squads.com/",
			],
		);
		assert.equal(
			calls.some((call) => /\/zones\/?($|\?)/.test(new URL(call.url).pathname)),
			false,
		);
	} finally {
		restore();
	}
});

test("an existing project and a matching DNS record are left in place", { timeout: 2_000 }, async () => {
	const restore = guard();
	try {
		const { calls, fetchImpl } = recorder((seen) => {
			const { method, url } = seen;
			if (method === "GET" && url.endsWith("/pages/projects/ts-proof")) return json({ name: "ts-proof" });
			if (method === "POST" && url.endsWith("/pages/projects")) throw new Error("created a project");
			if (url.endsWith("/upload-token")) return json({ jwt: "upload-jwt" });
			if (url.endsWith("/check-missing")) return json([]);
			if (url.endsWith("/pages/assets/upload")) throw new Error("uploaded a hash that was present");
			if (url.endsWith("/upsert-hashes")) return json([]);
			if (url.endsWith("/deployments")) return json({ id: "dep" });
			if (method === "POST" && url.endsWith("/domains")) {
				return json({ name: "proof.10squads.com", status: "active", zone_tag: ZONE });
			}
			if (method === "GET" && url.includes("/dns_records")) {
				return json([{ type: "CNAME", name: "proof.10squads.com", content: "TS-proof.pages.dev", proxied: true }]);
			}
			if (method === "POST" && url.endsWith("/dns_records")) throw new Error("overwrote DNS");
			if (method === "GET" && url.includes("/domains/")) {
				return json({ name: "proof.10squads.com", status: "active", zone_tag: ZONE });
			}
			if (url === "https://proof.10squads.com/") return new Response(HTML, { status: 200 });
			throw new Error(`unexpected ${method} ${url}`);
		});
		const live = await clientFor(fetchImpl, { deadlineMs: 0 }).publish("proof", HTML);
		assert.equal(live, "https://proof.10squads.com");
		assert.equal(
			calls.some((call) => call.url.endsWith("/pages/assets/upload")),
			false,
		);
		assert.equal(
			calls.some((call) => call.method === "POST" && call.url.endsWith("/dns_records")),
			false,
		);
	} finally {
		restore();
	}
});

test("a failed upload is not retried", { timeout: 2_000 }, async () => {
	const restore = guard();
	try {
		let uploads = 0;
		const hash = pagesAssetHash(new TextEncoder().encode(HTML), "html");
		const { fetchImpl } = recorder((seen) => {
			if (seen.url.endsWith("/pages/projects/ts-proof") && seen.method === "GET") return json({ name: "ts-proof" });
			if (seen.url.endsWith("/upload-token")) return json({ jwt: "upload-jwt" });
			if (seen.url.endsWith("/check-missing")) return json([hash]);
			if (seen.url.endsWith("/pages/assets/upload")) {
				uploads += 1;
				return json(null, 500);
			}
			throw new Error(`unexpected ${seen.method} ${seen.url}`);
		});
		await assert.rejects(
			() => clientFor(fetchImpl, { deadlineMs: 0 }).publish("proof", HTML),
			(error: unknown) => {
				assert.ok(error instanceof PagesFailure);
				assert.equal(error.status, 502);
				assert.equal(error.message, "The page was not uploaded.");
				return true;
			},
		);
		assert.equal(uploads, 1);
	} finally {
		restore();
	}
});

test("the domain wait fails at the deadline and a bad domain fails at once", { timeout: 2_000 }, async () => {
	const restore = guard();
	try {
		const pending = recorder((seen) => {
			if (seen.method === "GET" && seen.url.endsWith("/pages/projects/ts-proof")) return json({ name: "ts-proof" });
			if (seen.url.endsWith("/upload-token")) return json({ jwt: "upload-jwt" });
			if (seen.url.endsWith("/check-missing")) return json([]);
			if (seen.url.endsWith("/upsert-hashes")) return json([]);
			if (seen.url.endsWith("/deployments")) return json({ id: "dep" });
			if (seen.method === "POST" && seen.url.endsWith("/domains")) {
				return json({ name: "proof.10squads.com", status: "pending", zone_tag: ZONE });
			}
			if (seen.url.includes("/dns_records")) return seen.method === "GET" ? json([]) : json({ id: "rec" });
			if (seen.url.includes("/domains/")) return json({ status: "pending", zone_tag: ZONE });
			throw new Error(`unexpected ${seen.method} ${seen.url}`);
		});
		const sleeps: number[] = [];
		await assert.rejects(
			() => clientFor(pending.fetchImpl, { deadlineMs: 0, sleeps }).publish("proof", HTML),
			(error: unknown) =>
				error instanceof PagesFailure && error.message === "The custom domain did not become active.",
		);
		assert.deepEqual(sleeps, []);

		const broken = recorder((seen) => {
			if (seen.method === "GET" && seen.url.endsWith("/pages/projects/ts-proof")) return json({ name: "ts-proof" });
			if (seen.url.endsWith("/upload-token")) return json({ jwt: "upload-jwt" });
			if (seen.url.endsWith("/check-missing")) return json([]);
			if (seen.url.endsWith("/upsert-hashes")) return json([]);
			if (seen.url.endsWith("/deployments")) return json({ id: "dep" });
			if (seen.method === "POST" && seen.url.endsWith("/domains")) {
				return json({ name: "proof.10squads.com", status: "error", zone_tag: ZONE });
			}
			throw new Error(`unexpected ${seen.method} ${seen.url}`);
		});
		await assert.rejects(
			() => clientFor(broken.fetchImpl, { deadlineMs: 0 }).publish("proof", HTML),
			(error: unknown) => error instanceof PagesFailure && error.message === "The custom domain failed.",
		);
	} finally {
		restore();
	}
});

test("a missing zone tag fails before any zone list", { timeout: 2_000 }, async () => {
	const restore = guard();
	try {
		const { calls, fetchImpl } = recorder((seen) => {
			if (seen.url.includes("/zones")) throw new Error("listed zones");
			if (seen.method === "GET" && seen.url.endsWith("/pages/projects/ts-proof")) return json({ name: "ts-proof" });
			if (seen.url.endsWith("/upload-token")) return json({ jwt: "upload-jwt" });
			if (seen.url.endsWith("/check-missing")) return json([]);
			if (seen.url.endsWith("/upsert-hashes")) return json([]);
			if (seen.url.endsWith("/deployments")) return json({ id: "dep" });
			if (seen.method === "POST" && seen.url.endsWith("/domains"))
				return json({ name: "proof.10squads.com", status: "pending" });
			throw new Error(`unexpected ${seen.method} ${seen.url}`);
		});
		await assert.rejects(
			() => clientFor(fetchImpl, { deadlineMs: 0 }).publish("proof", HTML),
			(error: unknown) =>
				error instanceof PagesFailure && error.message === "The 10squads.com zone was not on the domain.",
		);
		assert.equal(
			calls.some((call) => call.url.includes("/zones")),
			false,
		);
	} finally {
		restore();
	}
});

test("a mismatched DNS record is not overwritten", { timeout: 2_000 }, async () => {
	const restore = guard();
	try {
		const { fetchImpl } = recorder((seen) => {
			if (seen.method === "POST" && seen.url.endsWith("/dns_records")) throw new Error("overwrote DNS");
			if (seen.method === "GET" && seen.url.endsWith("/pages/projects/ts-proof")) return json({ name: "ts-proof" });
			if (seen.url.endsWith("/upload-token")) return json({ jwt: "upload-jwt" });
			if (seen.url.endsWith("/check-missing")) return json([]);
			if (seen.url.endsWith("/upsert-hashes")) return json([]);
			if (seen.url.endsWith("/deployments")) return json({ id: "dep" });
			if (seen.method === "POST" && seen.url.endsWith("/domains")) {
				return json({ name: "proof.10squads.com", status: "active", zone_tag: ZONE });
			}
			if (seen.method === "GET" && seen.url.includes("/dns_records")) {
				return json([{ type: "CNAME", name: "proof.10squads.com", content: "elsewhere.example", proxied: true }]);
			}
			throw new Error(`unexpected ${seen.method} ${seen.url}`);
		});
		await assert.rejects(
			() => clientFor(fetchImpl, { deadlineMs: 0 }).publish("proof", HTML),
			(error: unknown) => error instanceof PagesFailure && error.message === "The DNS record does not match.",
		);
	} finally {
		restore();
	}
});

test("an attached domain is reused and a redirect is not followed", { timeout: 2_000 }, async () => {
	const restore = guard();
	try {
		const attached = recorder((seen) => {
			if (seen.method === "GET" && seen.url.endsWith("/pages/projects/ts-proof")) return json({ name: "ts-proof" });
			if (seen.url.endsWith("/upload-token")) return json({ jwt: "upload-jwt" });
			if (seen.url.endsWith("/check-missing")) return json([]);
			if (seen.url.endsWith("/upsert-hashes")) return json([]);
			if (seen.url.endsWith("/deployments")) return json({ id: "dep" });
			if (seen.method === "POST" && seen.url.endsWith("/domains")) return json(null, 409);
			if (seen.method === "GET" && seen.url.includes("/domains/")) {
				return json({ name: "proof.10squads.com", status: "active", zone_tag: ZONE });
			}
			if (seen.method === "GET" && seen.url.includes("/dns_records")) {
				return json([{ type: "CNAME", name: "Proof.10squads.com", content: "ts-proof.pages.dev", proxied: true }]);
			}
			if (seen.url === "https://proof.10squads.com/") return new Response("ok", { status: 200 });
			throw new Error(`unexpected ${seen.method} ${seen.url}`);
		});
		assert.equal(
			await clientFor(attached.fetchImpl, { deadlineMs: 0 }).publish("proof", HTML),
			"https://proof.10squads.com",
		);

		const redirected = recorder(
			() => new Response(null, { status: 302, headers: { location: "https://evil.example" } }),
		);
		await assert.rejects(
			() => clientFor(redirected.fetchImpl, { deadlineMs: 0 }).publish("proof", HTML),
			(error: unknown) => error instanceof PagesFailure && error.message === "The Cloudflare API redirected.",
		);
		assert.equal(redirected.calls.length, 1);

		const denied = recorder(() => json(null, 401));
		await assert.rejects(
			() => clientFor(denied.fetchImpl, { deadlineMs: 0 }).publish("proof", HTML),
			(error: unknown) =>
				error instanceof PagesFailure &&
				error.status === 503 &&
				error.message === "The machine service is not configured.",
		);
		assert.equal(denied.calls.length, 1);
	} finally {
		restore();
	}
});

test("a missing token makes no request", { timeout: 2_000 }, async () => {
	const restore = guard();
	try {
		const { calls, fetchImpl } = recorder(() => json(null));
		await assert.rejects(
			() => createPagesClient({ token: "", fetch: fetchImpl, deadlineMs: 0 }).publish("proof", HTML),
			(error: unknown) =>
				error instanceof PagesFailure &&
				error.status === 503 &&
				error.message === "The machine service is not configured.",
		);
		assert.equal(calls.length, 0);
	} finally {
		restore();
	}
});

test("an active domain whose site is not ready fails clearly", { timeout: 2_000 }, async () => {
	const restore = guard();
	try {
		const { calls, fetchImpl } = recorder((seen) => {
			if (seen.method === "GET" && seen.url.endsWith("/pages/projects/ts-proof")) return json({ name: "ts-proof" });
			if (seen.url.endsWith("/upload-token")) return json({ jwt: "upload-jwt" });
			if (seen.url.endsWith("/check-missing")) return json([]);
			if (seen.url.endsWith("/upsert-hashes")) return json([]);
			if (seen.url.endsWith("/deployments")) return json({ id: "dep" });
			if (seen.method === "POST" && seen.url.endsWith("/domains")) {
				return json({ name: "proof.10squads.com", status: "active", zone_tag: ZONE });
			}
			if (seen.method === "GET" && seen.url.includes("/dns_records")) {
				return json([{ type: "CNAME", name: "proof.10squads.com", content: "ts-proof.pages.dev", proxied: true }]);
			}
			if (seen.method === "GET" && seen.url.includes("/domains/")) {
				return json({ status: "active", zone_tag: ZONE });
			}
			if (seen.url === "https://proof.10squads.com/") return new Response("no", { status: 404 });
			throw new Error(`unexpected ${seen.method} ${seen.url}`);
		});
		await assert.rejects(
			() => clientFor(fetchImpl, { deadlineMs: 0 }).publish("proof", HTML),
			(error: unknown) =>
				error instanceof PagesFailure && error.message === "The published site did not return 200.",
		);
		assert.equal(calls.filter((call) => call.url === "https://proof.10squads.com/").length, 1);
	} finally {
		restore();
	}
});
