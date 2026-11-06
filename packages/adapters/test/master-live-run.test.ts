import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { Pool } from "@neondatabase/serverless";
import { digestOf, parseResearchTask } from "@tensquads/agent-kit";
import type { PublishedEvent } from "@tensquads/kernel";
import { eq } from "drizzle-orm";

import { replaceDemoAccount } from "../../seed/src/demo-account.ts";
import { AccountBus, type BusObjectEnv } from "../src/cloudflare-bus/account-bus.ts";
import { writePending } from "../src/cloudflare-bus/neon-write.ts";
import { decide } from "../src/neon/commands/approvals.ts";
import { schema } from "../src/neon/schema.ts";
import { Storage } from "./bus-storage.ts";
import { openPglite } from "./pglite.ts";

const url = "postgres://fixture/live-run";
const TASK_ID = "business-review-real";
const NO_ITEMS = "The business has no items to show.";
const NO_FINDING = "The research has no finding to show.";
// A fake model reply. The brief must never show any of these phrases.
const MODEL_TEXT =
	"The menu hides salad prices. We serve lobster thermidor. Lobster costs 999. Lobster costs ١٢. Lobster costs twelve.";
const MODEL_PHRASES = ["We serve lobster thermidor", "Lobster costs 999", "Lobster costs ١٢", "Lobster costs twelve"];

type Story = Awaited<ReturnType<typeof import("@tensquads/domain/master").proofStory>>;

// The brief must equal this template, byte for byte. The menu section is renderItemSection(items).
function briefTemplate(story: Story, section: string): string {
	return [
		`Business: ${story.request.businessName}`,
		`Type: ${story.request.businessType}`,
		"",
		"What the research found:",
		`${story.report.gap} ${story.report.gapEvidence.sourceUrl}`,
		"",
		"Sources:",
		...story.report.sources,
		"",
		"Menu:",
		section,
	].join("\n");
}

function modelReply(input: Parameters<typeof fetch>[0]): Promise<Response> {
	if (String(input) !== "https://api.openai.com/v1/chat/completions") {
		return Promise.reject(new Error("An unexpected request reached the fake model."));
	}
	const body = JSON.stringify({ choices: [{ message: { content: MODEL_TEXT } }] });
	return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "application/json" } }));
}

function routePool(t: test.TestContext, database: Awaited<ReturnType<typeof openPglite>>) {
	t.mock.method(Pool.prototype, "query", async (config: { text: string; rowMode?: string }, params: unknown[]) => {
		const result = await database.client.query<Record<string, unknown>>(config.text, params);
		const rows = config.rowMode === "array" ? result.rows.map((row) => Object.values(row)) : result.rows;
		return { ...result, rows };
	});
	t.mock.method(Pool.prototype, "connect", async () => ({
		query: (config: { text: string }, params: unknown[]) => database.client.query(config.text, params),
		release() {},
	}));
}

function reportEvent(id: string, report: unknown): PublishedEvent {
	return {
		id,
		time: "12:02",
		from: "market",
		to: "master",
		kind: "Result",
		skill: "report.write",
		text: "The report, the sources, and the evidence.",
		payload: { report },
		writes: [],
		trace: `tr_${id}`,
	};
}

function userYes(id: string): PublishedEvent {
	return {
		id,
		time: "12:03",
		from: "user",
		to: "master",
		kind: "Approval",
		skill: "brief.write",
		text: "Yes.",
		payload: {},
		writes: [],
		trace: `tr_${id}`,
	};
}

async function storedEvents(storage: Storage): Promise<PublishedEvent[]> {
	const rows = await storage.list<PublishedEvent>({ prefix: "event:" });
	return [...rows.entries()]
		.sort((left, right) => left[0].localeCompare(right[0], "en", { numeric: true }))
		.map(([, event]) => event);
}

async function bus(t: test.TestContext, accountId: string, clerkUserId: string, request: unknown, taskId: string) {
	const database = await openPglite();
	routePool(t, database);
	await replaceDemoAccount(database.db, accountId, clerkUserId);
	await database.db.insert(schema.agents).values({
		accountId,
		id: "website",
		name: "Website builder",
		role: "Website builder",
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
		sortOrder: 9,
	});
	const storage = new Storage();
	await storage.put("account", accountId);
	await storage.put("seq", 1);
	await storage.put("state:business", JSON.stringify(request));
	await storage.put("event:1", {
		id: taskId,
		time: "12:01",
		from: "master",
		to: "market",
		kind: "Task",
		skill: "task.route",
		text: "Research this business.",
		payload: {
			businessName: (request as { businessName: string }).businessName,
			businessType: (request as { businessType: string }).businessType,
			items: (request as { items: unknown }).items,
			cuisine: (request as { cuisine?: string }).cuisine,
		},
		writes: ["business"],
		trace: `tr_${taskId}`,
	});
	return { database, storage };
}

test("a live owner yes emits the build task for the stored research task", async (t) => {
	const { proofStory } = await import("@tensquads/domain/master");
	const story = await proofStory();
	const accountId = "review-real";
	const opened = await bus(t, accountId, "clerk-review", story.request, TASK_ID);
	const previous = process.env.ADAPTERS;
	process.env.ADAPTERS = "real";
	try {
		const env: BusObjectEnv = {
			ADAPTERS: "real",
			DATABASE_URL: url,
			masterReadPage: async (pageUrl: string) => story.pages[pageUrl] ?? { status: 404, body: "" },
			masterAudit: () => story.audit,
			masterBrowser: async () => ({
				visibleText: "Proof Kitchen",
				cssContent: [],
				linkTexts: [],
				imageCount: 0,
				horizontalScroll: false,
				keyboard: true,
				contrast: true,
			}),
		};
		const target = new AccountBus({ storage: opened.storage, acceptWebSocket() {}, getWebSockets: () => [] }, env);
		assert.equal((await post(target, accountId, reportEvent("live-report", story.report))).status, 200);
		const approval = (await storedEvents(opened.storage)).find((event) => event.skill === "brief.write");
		assert.ok(approval);
		assert.equal(approval.payload.taskId, TASK_ID);
		await decide(
			opened.database.db,
			{ accountId, mode: "account" },
			approval.id,
			true,
			undefined,
			async () => {},
			undefined,
			"clerk-review",
		);
		const mandates = await opened.database.db
			.select({ taskId: schema.mandates.taskId })
			.from(schema.mandates)
			.where(eq(schema.mandates.accountId, accountId));
		assert.equal(mandates[0]?.taskId, TASK_ID);
		assert.equal((await post(target, accountId, userYes("live-yes"))).status, 200);
		const build = (await storedEvents(opened.storage)).find((event) => event.text.startsWith("Build the page."));
		assert.ok(build);
		assert.equal(build.to, "website");
		assert.equal(build.kind, "Task");
	} finally {
		if (previous === undefined) delete process.env.ADAPTERS;
		else process.env.ADAPTERS = previous;
		await opened.database.close();
	}
});

test("a live research retry keeps the stored research payload", async (t) => {
	const { proofStory } = await import("@tensquads/domain/master");
	const story = await proofStory();
	const accountId = "review-retry";
	const opened = await bus(t, accountId, "clerk-retry", story.request, "business-review-retry");
	const previous = process.env.ADAPTERS;
	process.env.ADAPTERS = "real";
	try {
		const env: BusObjectEnv = {
			ADAPTERS: "real",
			DATABASE_URL: url,
			masterReadPage: async (pageUrl: string) => story.pages[pageUrl] ?? { status: 404, body: "" },
		};
		const target = new AccountBus({ storage: opened.storage, acceptWebSocket() {}, getWebSockets: () => [] }, env);
		const full = story.report as typeof story.report & { readonly competitors: readonly unknown[] };
		const short = { ...full, competitors: full.competitors.slice(0, 2) };
		assert.equal((await post(target, accountId, reportEvent("retry-report", short))).status, 200);
		const retry = (await storedEvents(opened.storage)).find(
			(event) => event.kind === "Task" && event.to === "market" && event.id !== "business-review-retry",
		);
		assert.ok(retry);
		const parsed = parseResearchTask(retry.payload);
		assert.equal(parsed.businessName, story.request.businessName);
		assert.equal(parsed.businessType, story.request.businessType);
		assert.equal(parsed.items.length, story.request.items.length);
		const evidence = retry.payload.evidence;
		assert.equal(Array.isArray(evidence) && evidence.includes("The report needs three competitors."), true);
	} finally {
		if (previous === undefined) delete process.env.ADAPTERS;
		else process.env.ADAPTERS = previous;
		await opened.database.close();
	}
});

test("an empty item list stops in chat and does not ask for approval", async (t) => {
	const { proofStory } = await import("@tensquads/domain/master");
	const story = await proofStory();
	const accountId = "review-empty";
	const request = { ...story.request, items: [] };
	const opened = await bus(t, accountId, "clerk-empty", request, "business-review-empty");
	const previous = process.env.ADAPTERS;
	process.env.ADAPTERS = "real";
	try {
		const env: BusObjectEnv = {
			ADAPTERS: "real",
			DATABASE_URL: url,
			masterReadPage: async (pageUrl: string) => story.pages[pageUrl] ?? { status: 404, body: "" },
		};
		const target = new AccountBus({ storage: opened.storage, acceptWebSocket() {}, getWebSockets: () => [] }, env);
		assert.equal((await post(target, accountId, reportEvent("empty-report", story.report))).status, 200);
		const stored = await storedEvents(opened.storage);
		assert.equal(
			stored.some((event) => event.kind === "Approval"),
			false,
		);
		assert.equal(
			stored.some((event) => event.text === NO_ITEMS),
			true,
		);
		const chat = await opened.database.client.query<{ body: string }>(
			"SELECT body FROM messages WHERE account_id = $1 AND body = $2",
			[accountId, NO_ITEMS],
		);
		assert.equal(chat.rows.length, 1);
		assert.equal(chat.rows[0]?.body, NO_ITEMS);
	} finally {
		if (previous === undefined) delete process.env.ADAPTERS;
		else process.env.ADAPTERS = previous;
		await opened.database.close();
	}
});

test("the persisted publish mandate subject is the preview html digest", async (t) => {
	const { proofStory } = await import("@tensquads/domain/master");
	const story = await proofStory();
	const html = `${story.pageHtml}\nCafé`;
	const subject = await digestOf(html);
	const detail = "https://preview.example/proof";
	assert.notEqual(subject, await digestOf(detail));
	const accountId = "review-publish";
	const opened = await bus(t, accountId, "clerk-publish", story.request, TASK_ID);
	const previous = process.env.ADAPTERS;
	process.env.ADAPTERS = "real";
	try {
		const event: PublishedEvent = {
			id: "pub-ask",
			time: "12:04",
			from: "master",
			to: "user",
			kind: "Approval",
			skill: "approval.ask",
			text: "Publish the site?",
			payload: {
				previewUrl: detail,
				taskId: TASK_ID,
				skill: "website.publish",
				subject,
				slug: accountId,
			},
			writes: [],
			trace: "tr_pub",
		};
		await writePending(url, accountId, [{ seq: 2, event }]);
		await decide(
			opened.database.db,
			{ accountId, mode: "account" },
			"pub-ask",
			true,
			undefined,
			async () => {},
			undefined,
			"clerk-publish",
		);
		const rows = await opened.database.db
			.select({ subject: schema.mandates.subject })
			.from(schema.mandates)
			.where(eq(schema.mandates.accountId, accountId));
		assert.equal(rows[0]?.subject, subject);
		assert.notEqual(rows[0]?.subject, await digestOf(detail));
	} finally {
		if (previous === undefined) delete process.env.ADAPTERS;
		else process.env.ADAPTERS = previous;
		await opened.database.close();
	}
});

test("model text never reaches the brief the owner approves", async (t) => {
	const { proofStory, renderItemSection } = await import("@tensquads/domain/master");
	const story = await proofStory();
	const accountId = "review-model-text";
	const opened = await bus(t, accountId, "clerk-model", story.request, TASK_ID);
	const previous = process.env.ADAPTERS;
	process.env.ADAPTERS = "real";
	try {
		const env: BusObjectEnv = {
			ADAPTERS: "real",
			DATABASE_URL: url,
			OPENAI_API_KEY: "test-key",
			MASTER_MODEL: "unit-model",
			MASTER_REASONING_EFFORT: "medium",
			fetchApi: modelReply,
			masterReadPage: async (pageUrl: string) => story.pages[pageUrl] ?? { status: 404, body: "" },
			masterAudit: () => story.audit,
		};
		const target = new AccountBus({ storage: opened.storage, acceptWebSocket() {}, getWebSockets: () => [] }, env);
		assert.equal((await post(target, accountId, reportEvent("model-report", story.report))).status, 200);
		const approval = (await storedEvents(opened.storage)).find((event) => event.skill === "brief.write");
		assert.ok(approval);
		const brief = (approval.payload.brief as { text: string }).text;
		for (const phrase of MODEL_PHRASES) assert.equal(brief.includes(phrase), false);
		assert.equal(brief, briefTemplate(story, renderItemSection(story.request.items)));
	} finally {
		if (previous === undefined) delete process.env.ADAPTERS;
		else process.env.ADAPTERS = previous;
		await opened.database.close();
	}
});

test("an empty research finding stops in chat and does not ask for approval", async (t) => {
	const { proofStory } = await import("@tensquads/domain/master");
	const story = await proofStory();
	const accountId = "review-no-finding";
	const opened = await bus(t, accountId, "clerk-finding", story.request, "business-review-finding");
	const previous = process.env.ADAPTERS;
	process.env.ADAPTERS = "real";
	try {
		const env: BusObjectEnv = {
			ADAPTERS: "real",
			DATABASE_URL: url,
			masterReadPage: async (pageUrl: string) => story.pages[pageUrl] ?? { status: 404, body: "" },
			masterAudit: () => story.audit,
		};
		const target = new AccountBus({ storage: opened.storage, acceptWebSocket() {}, getWebSockets: () => [] }, env);
		const empty = { ...story.report, gap: "" };
		assert.equal((await post(target, accountId, reportEvent("finding-report", empty))).status, 200);
		const stored = await storedEvents(opened.storage);
		assert.equal(
			stored.some((event) => event.kind === "Approval"),
			false,
		);
		assert.equal(
			stored.some((event) => event.text === NO_FINDING),
			true,
		);
		const chat = await opened.database.client.query<{ body: string }>(
			"SELECT body FROM messages WHERE account_id = $1 AND body = $2",
			[accountId, NO_FINDING],
		);
		assert.equal(chat.rows.length, 1);
	} finally {
		if (previous === undefined) delete process.env.ADAPTERS;
		else process.env.ADAPTERS = previous;
		await opened.database.close();
	}
});

test("the stored brief mandate subject is the sha256 of the brief text", async (t) => {
	const { proofStory } = await import("@tensquads/domain/master");
	const story = await proofStory();
	const accountId = "review-brief-subject";
	const opened = await bus(t, accountId, "clerk-subject", story.request, TASK_ID);
	const previous = process.env.ADAPTERS;
	process.env.ADAPTERS = "real";
	try {
		const env: BusObjectEnv = {
			ADAPTERS: "real",
			DATABASE_URL: url,
			masterReadPage: async (pageUrl: string) => story.pages[pageUrl] ?? { status: 404, body: "" },
			masterAudit: () => story.audit,
		};
		const target = new AccountBus({ storage: opened.storage, acceptWebSocket() {}, getWebSockets: () => [] }, env);
		assert.equal((await post(target, accountId, reportEvent("subject-report", story.report))).status, 200);
		const approval = (await storedEvents(opened.storage)).find((event) => event.skill === "brief.write");
		assert.ok(approval);
		const brief = (approval.payload.brief as { text: string }).text;
		const sha = createHash("sha256").update(brief, "utf8").digest("hex");
		assert.equal(approval.payload.subject, sha);
		await decide(
			opened.database.db,
			{ accountId, mode: "account" },
			approval.id,
			true,
			undefined,
			async () => {},
			undefined,
			"clerk-subject",
		);
		const rows = await opened.database.db
			.select({ subject: schema.mandates.subject })
			.from(schema.mandates)
			.where(eq(schema.mandates.accountId, accountId));
		assert.equal(rows[0]?.subject, sha);
	} finally {
		if (previous === undefined) delete process.env.ADAPTERS;
		else process.env.ADAPTERS = previous;
		await opened.database.close();
	}
});

function post(target: AccountBus, accountId: string, event: PublishedEvent): Promise<Response> {
	return target.fetch(
		new Request("https://bus/accept", {
			method: "POST",
			body: JSON.stringify({ accountId, event }),
		}),
	);
}
