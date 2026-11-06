import assert from "node:assert/strict";
import test from "node:test";

import { AccountBus } from "../src/cloudflare-bus/account-bus.ts";
import type { BusNamespace, WorkerBindings } from "../src/cloudflare-bus/http.ts";
import { handleMachineRequest } from "../src/cloudflare-bus/http.ts";
import type { PagesClient } from "../src/cloudflare-bus/pages-client.ts";
import { PagesFailure } from "../src/cloudflare-bus/pages-client.ts";
import { signMachineToken } from "../src/cloudflare-bus/token.ts";
import { Storage } from "./bus-storage.ts";

const KEY = "machine-token-fixture";
const ORIGIN = "https://worker.test";

type Env = WorkerBindings & {
	pages?: PagesClient;
	CLOUDFLARE_PAGES_API_TOKEN?: string;
};

function createEnv(extra: Partial<Env> = {}, databaseUrl?: string): { env: Env; stores: Map<string, Storage> } {
	const stores = new Map<string, Storage>();
	const buses = new Map<string, AccountBus>();
	const namespace: BusNamespace = {
		idFromName: (name) => name,
		get: (id) => {
			const name = String(id);
			let bus = buses.get(name);
			if (!bus) {
				const storage = new Storage();
				stores.set(name, storage);
				bus = new AccountBus(
					{ storage, acceptWebSocket() {}, getWebSockets: () => [] },
					databaseUrl ? { DATABASE_URL: databaseUrl } : {},
				);
				buses.set(name, bus);
			}
			return {
				fetch: (input, init) => {
					const request = input instanceof Request ? input : new Request(input, init);
					return bus.fetch(request);
				},
			};
		},
	};
	return {
		stores,
		env: { ADAPTERS: "real", MACHINE_TOKEN_KEY: KEY, ACCOUNT_BUS: namespace, ...extra },
	};
}

function guard(): () => void {
	const prior = globalThis.fetch;
	globalThis.fetch = () => Promise.reject(new Error("The test called the network."));
	return () => {
		globalThis.fetch = prior;
	};
}

async function bearer(accountId: string, agentId: string): Promise<string> {
	const exp = Math.floor(Date.now() / 1000) + 3600;
	return `Bearer ${await signMachineToken(KEY, accountId, agentId, exp)}`;
}

async function post(env: Env, path: string, body: unknown, accountId: string, agentId: string, authorization?: string) {
	const response = await handleMachineRequest(
		new Request(`${ORIGIN}${path}`, {
			method: "POST",
			headers: {
				authorization: authorization ?? (await bearer(accountId, agentId)),
				"content-type": "application/json",
			},
			body: JSON.stringify(body),
		}),
		env,
	);
	assert.ok(response);
	return response;
}

async function read(env: Env, url: string): Promise<Response> {
	const response = await handleMachineRequest(new Request(url), env);
	assert.ok(response);
	return response;
}

test("test mode answers 404 for preview and publish", async () => {
	const restore = guard();
	try {
		const { env } = createEnv({ ADAPTERS: "test" });
		const preview = await post(
			env,
			"/machine/preview",
			{ accountId: "proof", agentId: "site", taskId: "page", html: "x" },
			"proof",
			"site",
		);
		const publish = await post(
			env,
			"/machine/publish",
			{ accountId: "proof", agentId: "site", taskId: "page", slug: "proof", html: "x", mandate: {} },
			"proof",
			"site",
		);
		const page = await read(env, `${ORIGIN}/preview/proof/page`);
		assert.equal(preview.status, 404);
		assert.equal(publish.status, 404);
		assert.equal(page.status, 404);
		const other = await handleMachineRequest(new Request(`${ORIGIN}/health`), env);
		assert.equal(other, null);
		const bare = await handleMachineRequest(new Request(`${ORIGIN}/preview`), env);
		assert.equal(bare, null);
	} finally {
		restore();
	}
});

test("a bad token is rejected before the slug check", async () => {
	const restore = guard();
	try {
		const { env } = createEnv();
		const wrong = await bearer("other", "site");
		const denied = await post(
			env,
			"/machine/preview",
			{ accountId: "NOT A SLUG", agentId: "site", taskId: "page", html: "x" },
			"NOT A SLUG",
			"site",
			wrong,
		);
		assert.equal(denied.status, 401);
		assert.equal(await denied.text(), "The token was rejected.");
		const { env: bare } = createEnv({ MACHINE_TOKEN_KEY: undefined });
		const missing = await post(
			bare,
			"/machine/preview",
			{ accountId: "proof", agentId: "site", taskId: "page", html: "x" },
			"proof",
			"site",
			"Bearer x",
		);
		assert.equal(missing.status, 503);
		assert.equal(await missing.text(), "The machine service is not configured.");
	} finally {
		restore();
	}
});

test("a preview round trip keeps the non-ASCII bytes", async () => {
	const restore = guard();
	try {
		const html = "<!doctype html><title>Café 東京 🍣</title><p>مرحبا</p>";
		const { env, stores } = createEnv();
		const created = await post(
			env,
			"/machine/preview",
			{ accountId: "proof", agentId: "Website Builder", taskId: "page1", html },
			"proof",
			"Website Builder",
		);
		assert.equal(created.status, 200);
		const payload = (await created.json()) as { previewUrl: string };
		assert.equal(payload.previewUrl, `${ORIGIN}/preview/proof/page1`);
		const page = await read(env, payload.previewUrl);
		assert.equal(page.status, 200);
		assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
		const bytes = new Uint8Array(await page.arrayBuffer());
		assert.deepEqual(bytes, new TextEncoder().encode(html));
		const storage = stores.get("proof");
		assert.equal(await storage?.get("preview:page1"), html);
		assert.equal(await storage?.get("seq"), undefined);
		assert.equal(await storage?.get("account"), undefined);
	} finally {
		restore();
	}
});

test("checkPage passes on the raw bytes of a preview from this route", async () => {
	const restore = guard();
	try {
		const master = (await import("@tensquads/domain/master")) as unknown as {
			proofStory(): Promise<{
				pageHtml: string;
				request: {
					businessName: string;
					businessType: "restaurant" | "grocer";
					cuisine?: string;
					items: readonly { name: string; price: string; section: string }[];
				};
				brief: string;
				report: unknown;
				choice: unknown;
				audit: { keyboard: boolean; contrast: boolean; horizontalScroll: boolean };
				pages: Record<string, { status: number; body: string }>;
			}>;
			checkPage(input: {
				previewUrl: string;
				businessName: string;
				businessType: "restaurant" | "grocer";
				cuisine?: string;
				items: readonly { name: string; price: string; section: string }[];
				brief: string;
				report: unknown;
				choice: unknown;
				readPage: (url: string) => Promise<{ status: number; body: string; bytes?: Uint8Array }>;
				audit: (html: string) => { keyboard: boolean; contrast: boolean; horizontalScroll: boolean };
			}): Promise<{ pass: boolean; evidence: readonly string[] }>;
		};
		const story = await master.proofStory();
		const { env } = createEnv();
		const created = await post(
			env,
			"/machine/preview",
			{ accountId: "proof", agentId: "site", taskId: "page1", html: story.pageHtml },
			"proof",
			"site",
		);
		const previewUrl = ((await created.json()) as { previewUrl: string }).previewUrl;
		const checked = await master.checkPage({
			previewUrl,
			businessName: story.request.businessName,
			businessType: story.request.businessType,
			cuisine: story.request.cuisine,
			items: story.request.items,
			brief: story.brief,
			report: story.report,
			choice: story.choice,
			audit: () => story.audit,
			readPage: async (url) => {
				if (url !== previewUrl) return story.pages[url] ?? { status: 404, body: "" };
				const response = await read(env, url);
				const bytes = new Uint8Array(await response.arrayBuffer());
				return { status: response.status, body: new TextDecoder().decode(bytes), bytes };
			},
		});
		assert.equal(checked.pass, true, checked.evidence.join(" "));
	} finally {
		restore();
	}
});

test("preview paths and slugs are strict", async () => {
	const restore = guard();
	try {
		const { env } = createEnv();
		const long = "a".repeat(63);
		const created = await post(
			env,
			"/machine/preview",
			{ accountId: long, agentId: "site", taskId: "b", html: "ok" },
			long,
			"site",
		);
		assert.equal(created.status, 200);
		const tooLong = await post(
			env,
			"/machine/preview",
			{ accountId: "a".repeat(64), agentId: "site", taskId: "b", html: "ok" },
			"a".repeat(64),
			"site",
		);
		assert.equal(tooLong.status, 400);
		assert.equal(await tooLong.text(), "The message was rejected.");
		for (const taskId of ["Bad", "..", "-no", "a/b", ""]) {
			const rejected = await post(
				env,
				"/machine/preview",
				{ accountId: "proof", agentId: "site", taskId, html: "ok" },
				"proof",
				"site",
			);
			assert.equal(rejected.status, 400, taskId);
		}
		const missingHtml = await post(
			env,
			"/machine/preview",
			{ accountId: "proof", agentId: "site", taskId: "page" },
			"proof",
			"site",
		);
		assert.equal(missingHtml.status, 400);
		for (const path of [
			"/preview/proof/page1/",
			"/preview/proof/page1/more",
			"/preview/Proof/page1",
			"/preview/-no/page",
		]) {
			const rejected = await read(env, `${ORIGIN}${path}`);
			assert.equal(rejected.status, 400, path);
		}
		const absent = await read(env, `${ORIGIN}/preview/proof/missing`);
		assert.equal(absent.status, 404);
	} finally {
		restore();
	}
});

test("two accounts do not share a preview and a foreign account is refused", async () => {
	const restore = guard();
	try {
		const { env, stores } = createEnv();
		await post(
			env,
			"/machine/preview",
			{ accountId: "one", agentId: "site", taskId: "page", html: "ONE" },
			"one",
			"site",
		);
		await post(
			env,
			"/machine/preview",
			{ accountId: "two", agentId: "site", taskId: "page", html: "TWO" },
			"two",
			"site",
		);
		assert.deepEqual(
			new Uint8Array(await (await read(env, `${ORIGIN}/preview/one/page`)).arrayBuffer()),
			new TextEncoder().encode("ONE"),
		);
		assert.deepEqual(
			new Uint8Array(await (await read(env, `${ORIGIN}/preview/two/page`)).arrayBuffer()),
			new TextEncoder().encode("TWO"),
		);
		env.ACCOUNT_BUS?.get(env.ACCOUNT_BUS.idFromName("held"));
		await stores.get("held")?.put("account", "other");
		const refused = await post(
			env,
			"/machine/preview",
			{ accountId: "held", agentId: "site", taskId: "page", html: "NO" },
			"held",
			"site",
		);
		assert.equal(refused.status, 400);
		assert.equal(await stores.get("held")?.get("preview:page"), undefined);
		assert.equal(await stores.get("held")?.get("account"), "other");
	} finally {
		restore();
	}
});

test("preview storage does not open the database", { timeout: 3_000 }, async () => {
	const restore = guard();
	try {
		const { env, stores } = createEnv({}, "postgres://poison.invalid/no");
		const created = await post(
			env,
			"/machine/preview",
			{ accountId: "proof", agentId: "site", taskId: "page", html: "" },
			"proof",
			"site",
		);
		assert.equal(created.status, 200);
		assert.equal(await stores.get("proof")?.get("seq"), undefined);
		assert.equal(await (await read(env, `${ORIGIN}/preview/proof/page`)).text(), "");
	} finally {
		restore();
	}
});

test("publish requires the account slug and a mandate that covers the page", async () => {
	const restore = guard();
	try {
		const master = (await import("@tensquads/domain/master")) as unknown as {
			proofStory(): Promise<{ pageHtml: string; events: { payload: Record<string, unknown> }[] }>;
		};
		const story = await master.proofStory();
		let mandate: unknown;
		for (const event of story.events) {
			const approval = event.payload.approval;
			if (!approval || typeof approval !== "object") continue;
			const record = approval as { skill?: string; mandate?: unknown };
			if (record.skill === "site.publish") mandate = record.mandate;
		}
		assert.ok(mandate);
		const calls: { slug: string; html: string }[] = [];
		const pages: PagesClient = {
			async publish(slug, html) {
				calls.push({ slug, html });
				return `https://${slug}.10squads.com`;
			},
		};
		const { env } = createEnv({ pages });
		const published = await post(
			env,
			"/machine/publish",
			{ accountId: "proof", agentId: "site", taskId: "Task_1", slug: "proof", html: story.pageHtml, mandate },
			"proof",
			"site",
		);
		assert.equal(published.status, 200);
		assert.deepEqual(await published.json(), { liveUrl: "https://proof.10squads.com" });
		assert.deepEqual(calls, [{ slug: "proof", html: story.pageHtml }]);

		const mismatch = await post(
			env,
			"/machine/publish",
			{ accountId: "proof", agentId: "site", taskId: "Task_1", slug: "proof", html: `${story.pageHtml} `, mandate },
			"proof",
			"site",
		);
		assert.equal(mismatch.status, 400);
		const incomplete = await post(
			env,
			"/machine/publish",
			{
				accountId: "proof",
				agentId: "site",
				taskId: "Task_1",
				slug: "proof",
				html: story.pageHtml,
				mandate: { subject: "abc" },
			},
			"proof",
			"site",
		);
		assert.equal(incomplete.status, 400);
		const otherSlug = await post(
			env,
			"/machine/publish",
			{ accountId: "proof", agentId: "site", taskId: "Task_1", slug: "other", html: story.pageHtml, mandate },
			"proof",
			"site",
		);
		assert.equal(otherSlug.status, 400);
		assert.equal(calls.length, 1);

		const { env: broken } = createEnv({
			pages: {
				async publish() {
					throw new PagesFailure(502, "The page was not uploaded.");
				},
			},
		});
		const upstream = await post(
			broken,
			"/machine/publish",
			{ accountId: "proof", agentId: "site", taskId: "Task_1", slug: "proof", html: story.pageHtml, mandate },
			"proof",
			"site",
		);
		assert.equal(upstream.status, 502);
		assert.equal(await upstream.text(), "The page was not uploaded.");
		const { env: leaked } = createEnv({
			pages: {
				async publish() {
					throw new Error("token pages-token leaked");
				},
			},
		});
		const hidden = await post(
			leaked,
			"/machine/publish",
			{ accountId: "proof", agentId: "site", taskId: "Task_1", slug: "proof", html: story.pageHtml, mandate },
			"proof",
			"site",
		);
		assert.equal(hidden.status, 502);
		assert.equal(await hidden.text(), "The page was not uploaded.");
		const { env: unconfigured } = createEnv();
		const missing = await post(
			unconfigured,
			"/machine/publish",
			{ accountId: "proof", agentId: "site", taskId: "Task_1", slug: "proof", html: story.pageHtml, mandate },
			"proof",
			"site",
		);
		assert.equal(missing.status, 503);
		assert.equal(await missing.text(), "The machine service is not configured.");
	} finally {
		restore();
	}
});
