import assert from "node:assert/strict";
import test from "node:test";

import { digestOf } from "@tensquads/agent-kit";

import { AccountBus } from "../src/cloudflare-bus/account-bus.ts";
import type { BusNamespace, WorkerBindings } from "../src/cloudflare-bus/http.ts";
import { handleMachineRequest } from "../src/cloudflare-bus/http.ts";
import type { PagesClient } from "../src/cloudflare-bus/pages-client.ts";
import { directoryFromDatabase, type PublishDirectory } from "../src/cloudflare-bus/publish-directory.ts";
import { signMachineToken } from "../src/cloudflare-bus/token.ts";
import { accounts, agents, approvals, mandates } from "../src/neon/schema.ts";
import { Storage } from "./bus-storage.ts";
import { openPglite } from "./pglite.ts";

const KEY = "machine-token-fixture";
const ORIGIN = "https://worker.test";
const HTML = "<p>Proof</p>";
const CSP =
	"sandbox allow-scripts allow-popups; default-src 'self' 'unsafe-inline' data: https:; frame-ancestors 'none'";

type Env = WorkerBindings & {
	pages?: PagesClient;
	publishDirectory?: PublishDirectory;
};

function createEnv(extra: Partial<Env> = {}): Env {
	const buses = new Map<string, AccountBus>();
	const namespace: BusNamespace = {
		idFromName: (name) => name,
		get: (id) => {
			const name = String(id);
			let bus = buses.get(name);
			if (!bus) {
				bus = new AccountBus({ storage: new Storage(), acceptWebSocket() {}, getWebSockets: () => [] }, {});
				buses.set(name, bus);
			}
			return {
				fetch: (input, init) => bus.fetch(input instanceof Request ? input : new Request(input, init)),
			};
		},
	};
	return { ADAPTERS: "real", MACHINE_TOKEN_KEY: KEY, ACCOUNT_BUS: namespace, ...extra };
}

function allowWebsite(): PublishDirectory {
	return {
		async isWebsiteAgent() {
			return true;
		},
		async storedPublish() {
			return null;
		},
	};
}

function guard(): () => void {
	const prior = globalThis.fetch;
	globalThis.fetch = () => Promise.reject(new Error("The test called the network."));
	return () => {
		globalThis.fetch = prior;
	};
}

function countingPages(): { pages: PagesClient; calls: number } {
	const state = { calls: 0 };
	return {
		get calls() {
			return state.calls;
		},
		pages: {
			async publish(slug) {
				state.calls += 1;
				return `https://${slug}.10squads.com`;
			},
		},
	};
}

async function bearer(accountId: string, agentId: string): Promise<string> {
	const exp = Math.floor(Date.now() / 1000) + 3600;
	return `Bearer ${await signMachineToken(KEY, accountId, agentId, exp)}`;
}

async function post(env: Env, path: string, body: unknown, accountId: string, agentId: string): Promise<Response> {
	const response = await handleMachineRequest(
		new Request(`${ORIGIN}${path}`, {
			method: "POST",
			headers: {
				authorization: await bearer(accountId, agentId),
				"content-type": "application/json",
			},
			body: JSON.stringify(body),
		}),
		env,
	);
	assert.ok(response);
	return response;
}

type Database = Awaited<ReturnType<typeof openPglite>>["db"];

function ownerId(accountId: string): string {
	return `user_${accountId}`;
}

async function seedAccount(
	db: Database,
	accountId: string,
	roles: readonly { id: string; role: string }[],
	clerkUserId = ownerId(accountId),
): Promise<void> {
	await db.insert(accounts).values({
		id: accountId,
		accountId,
		name: "",
		owner: "Moe",
		email: "",
		tint: "",
		agents: roles.length,
		online: 0,
		tasks: 0,
		lastActive: "",
		createdWeek: 0,
		mission: "",
		sortOrder: 0,
		clerkUserId,
	});
	for (const [index, role] of roles.entries()) {
		await db.insert(agents).values({
			accountId,
			id: role.id,
			name: role.role,
			role: role.role,
			tint: "#e5e9f0",
			isOn: true,
			autonomy: "Ask first",
			mission: "Build one page from the brief.",
			contribution: 0,
			tasks: 0,
			success: "0%",
			saved: "0h",
			lastText: "",
			targets: [["Pages", "0", "1"]],
			kpis: [["Tasks", "0"]],
			sortOrder: index + 1,
		});
	}
}

async function seedMandate(
	db: Database,
	accountId: string,
	taskId: string,
	approvalId: string,
	fields: {
		saidYes?: string;
		saidAt: string;
		expiresAt: string | null;
		slug?: string;
		subject?: string;
		skill?: string;
	},
): Promise<void> {
	await db.insert(approvals).values({
		accountId,
		id: approvalId,
		agent: "website",
		title: "Publish the site?",
		detail: "",
		amount: "",
		status: "Approved",
		sortOrder: 1,
	});
	await db.insert(mandates).values({
		accountId,
		approvalId,
		ruleId: "poc-publish",
		ruleWhen: "The page passed the check.",
		ruleAction: "website.publish",
		ruleApproval: "Ask first",
		limitValue: 0,
		policyVersion: "poc-1",
		saidYes: fields.saidYes ?? ownerId(accountId),
		saidAt: new Date(fields.saidAt),
		taskId,
		skill: fields.skill ?? "website.publish",
		subject: fields.subject ?? digestOf(HTML),
		slug: fields.slug ?? accountId,
		expiresAt: fields.expiresAt === null ? null : new Date(fields.expiresAt),
	});
}

async function publishBody(
	env: Env,
	accountId: string,
	agentId: string,
	taskId: string,
	mandate: unknown = { subject: "nope" },
	html = HTML,
) {
	return post(
		env,
		"/machine/publish",
		{ accountId, agentId, taskId, slug: accountId, html, mandate },
		accountId,
		agentId,
	);
}

function assertSandbox(response: Response, html: boolean): void {
	const policy = response.headers.get("content-security-policy");
	assert.equal(policy, CSP);
	assert.equal(policy?.includes("allow-same-origin"), false);
	assert.equal(response.headers.get("x-content-type-options"), "nosniff");
	assert.equal(response.headers.get("referrer-policy"), "no-referrer");
	assert.equal(response.headers.get("cache-control"), "no-store");
	if (html) assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
}

test("the market agent and the master cannot preview or publish", { timeout: 30_000 }, async () => {
	const restore = guard();
	const database = await openPglite();
	const counted = countingPages();
	try {
		await seedAccount(database.db, "proof", [
			{ id: "website", role: "Website builder" },
			{ id: "market", role: "Market researcher" },
			{ id: "master", role: "Master" },
		]);
		await seedAccount(database.db, "shop", [{ id: "website", role: "Market researcher" }]);
		const env = createEnv({
			pages: counted.pages,
			publishDirectory: directoryFromDatabase(database.db),
		});
		for (const agentId of ["market", "master"] as const) {
			const preview = await post(
				env,
				"/machine/preview",
				{ accountId: "proof", agentId, taskId: "page", html: HTML },
				"proof",
				agentId,
			);
			assert.equal(preview.status, 403);
			assert.equal(await preview.text(), "The agent was rejected.");
			const published = await publishBody(env, "proof", agentId, "task-1");
			assert.equal(published.status, 403);
			assert.equal(await published.text(), "The agent was rejected.");
		}
		assert.equal(counted.calls, 0);
		const disguised = await post(
			env,
			"/machine/preview",
			{ accountId: "shop", agentId: "website", taskId: "page", html: HTML },
			"shop",
			"website",
		);
		assert.equal(disguised.status, 403);
		const disguisedPublish = await publishBody(env, "shop", "website", "task-1");
		assert.equal(disguisedPublish.status, 403);
		assert.equal(counted.calls, 0);
		const allowed = await post(
			env,
			"/machine/preview",
			{ accountId: "proof", agentId: "website", taskId: "page", html: HTML },
			"proof",
			"website",
		);
		assert.equal(allowed.status, 200);
	} finally {
		restore();
		await database.close();
	}
});

test("a stored publish mandate is refused unless every column matches", { timeout: 30_000 }, async () => {
	const restore = guard();
	const database = await openPglite();
	const counted = countingPages();
	try {
		const now = Date.parse("2026-11-06T12:00:00.000Z");
		const at = new Date(now).toISOString();
		const earlier = new Date(now - 60_000).toISOString();
		const later = new Date(now + 1_000).toISOString();
		const future = new Date(now + 60_000).toISOString();
		const website = [{ id: "website", role: "Website builder" }] as const;
		await seedAccount(database.db, "proof", website);
		await seedAccount(database.db, "beta", website);
		await seedAccount(database.db, "owned", website, "website");
		const env = createEnv({
			pages: counted.pages,
			publishDirectory: directoryFromDatabase(database.db),
			now: () => now,
		});

		const missing = await publishBody(env, "proof", "website", "missing");
		assert.equal(missing.status, 400, "missing row");
		assert.equal(await missing.text(), "The message was rejected.");
		assert.equal(counted.calls, 0);

		await seedMandate(database.db, "proof", "other-yes", "other-yes", {
			saidYes: "user_other",
			saidAt: at,
			expiresAt: future,
		});
		const otherYes = await publishBody(env, "proof", "website", "other-yes");
		assert.equal(otherYes.status, 400, "said_yes");
		assert.equal(counted.calls, 0);

		await seedMandate(database.db, "owned", "agent-yes", "agent-yes", {
			saidYes: "website",
			saidAt: at,
			expiresAt: future,
		});
		const agentYes = await publishBody(env, "owned", "website", "agent-yes");
		assert.equal(agentYes.status, 400, "agent id");
		assert.equal(counted.calls, 0);

		await seedMandate(database.db, "proof", "expires", "expires", { saidAt: at, expiresAt: at });
		const expired = await publishBody(env, "proof", "website", "expires");
		assert.equal(expired.status, 400, "expires_at");
		assert.equal(counted.calls, 0);

		await seedMandate(database.db, "proof", "blank-expiry", "blank-expiry", { saidAt: at, expiresAt: null });
		const blankExpiry = await publishBody(env, "proof", "website", "blank-expiry");
		assert.equal(blankExpiry.status, 400, "null expires_at");
		assert.equal(counted.calls, 0);

		await seedMandate(database.db, "proof", "skill", "skill", {
			saidAt: at,
			expiresAt: future,
			skill: "site.publish",
		});
		const skill = await publishBody(env, "proof", "website", "skill");
		assert.equal(skill.status, 400, "skill");
		assert.equal(counted.calls, 0);

		await seedMandate(database.db, "proof", "stored-task", "stored-task", { saidAt: later, expiresAt: future });
		const otherTask = await publishBody(env, "proof", "website", "other-task");
		assert.equal(otherTask.status, 400, "task");
		assert.equal(counted.calls, 0);

		await seedMandate(database.db, "proof", "cross", "cross", { saidAt: at, expiresAt: future, slug: "beta" });
		const otherAccount = await publishBody(env, "beta", "website", "cross");
		assert.equal(otherAccount.status, 400, "account");
		assert.equal(counted.calls, 0);

		await seedMandate(database.db, "proof", "slug", "slug", { saidAt: at, expiresAt: future, slug: "other" });
		const otherSlug = await publishBody(env, "proof", "website", "slug");
		assert.equal(otherSlug.status, 400, "slug");
		assert.equal(counted.calls, 0);

		await seedMandate(database.db, "proof", "subject", "subject", {
			saidAt: at,
			expiresAt: future,
			subject: digestOf("<p>Other</p>"),
		});
		const otherSubject = await publishBody(env, "proof", "website", "subject");
		assert.equal(otherSubject.status, 400, "subject");
		assert.equal(await otherSubject.text(), "The message was rejected.");
		assert.equal(counted.calls, 0);

		await seedMandate(database.db, "proof", "newest", "newest-old", { saidAt: earlier, expiresAt: future });
		await seedMandate(database.db, "proof", "newest", "newest-new", { saidAt: at, expiresAt: at });
		const newest = await publishBody(env, "proof", "website", "newest");
		assert.equal(newest.status, 400, "newest");
		assert.equal(counted.calls, 0);

		await seedMandate(database.db, "proof", "ready", "ready", { saidAt: at, expiresAt: future });
		const published = await publishBody(env, "proof", "website", "ready", { subject: "nope" });
		assert.equal(published.status, 200, "match");
		assert.deepEqual(await published.json(), { liveUrl: "https://proof.10squads.com" });
		assert.equal(counted.calls, 1);
		const changed = await publishBody(env, "proof", "website", "ready", { subject: "nope" }, "<p>Other</p>");
		assert.equal(changed.status, 400, "html");
		assert.equal(counted.calls, 1);
	} finally {
		restore();
		await database.close();
	}
});

test("a preview response sends a sandbox policy without allow-same-origin", async () => {
	const restore = guard();
	try {
		const env = createEnv({ publishDirectory: allowWebsite() });
		const created = await post(
			env,
			"/machine/preview",
			{ accountId: "proof", agentId: "website", taskId: "page", html: HTML },
			"proof",
			"website",
		);
		assert.equal(created.status, 200);
		const page = await handleMachineRequest(new Request(`${ORIGIN}/preview/proof/page`), env);
		assert.ok(page);
		assert.equal(page.status, 200);
		assertSandbox(page, true);
		const missing = await handleMachineRequest(new Request(`${ORIGIN}/preview/proof/absent`), env);
		assert.ok(missing);
		assert.equal(missing.status, 404);
		assertSandbox(missing, false);
	} finally {
		restore();
	}
});

test("a preview stores the BOM and the non-ASCII bytes", async () => {
	const restore = guard();
	try {
		const html = "\uFEFF<p>Café 東京</p>";
		const bytes = new TextEncoder().encode(html);
		assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
		const env = createEnv({ publishDirectory: allowWebsite() });
		const created = await post(
			env,
			"/machine/preview",
			{ accountId: "proof", agentId: "website", taskId: "page", html },
			"proof",
			"website",
		);
		assert.equal(created.status, 200);
		const page = await handleMachineRequest(new Request(`${ORIGIN}/preview/proof/page`), env);
		assert.ok(page);
		assert.deepEqual(new Uint8Array(await page.arrayBuffer()), bytes);
	} finally {
		restore();
	}
});

test("a preview without an agent directory is not configured", async () => {
	const restore = guard();
	try {
		const env = createEnv();
		const created = await post(
			env,
			"/machine/preview",
			{ accountId: "proof", agentId: "website", taskId: "page", html: HTML },
			"proof",
			"website",
		);
		assert.equal(created.status, 503);
		assert.equal(await created.text(), "The machine service is not configured.");
	} finally {
		restore();
	}
});
