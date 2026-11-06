import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { AccountBus, type BusObjectEnv } from "../src/cloudflare-bus/account-bus.ts";
import { decide } from "../src/neon/commands/approvals.ts";
import { schema } from "../src/neon/schema.ts";
import { bus, post, reportEvent, storedEvents, url, userYes } from "./master-live-helpers.ts";

const TASK_ID = "business-brief-live";
const REFUSED = "The brief did not pass its check.";
const NO_NAME = "The business has no name to show.";
const NO_FINDING = "The research has no finding to show.";
const MODEL_URL = "https://api.openai.com/v1/chat/completions";

interface ModelBody {
	readonly model: string;
	readonly reasoning_effort: string;
	readonly messages: readonly { readonly content: string }[];
}

// A fake model. It returns the queued replies in order, then the last one. It records each request.
function fakeModel(replies: readonly string[]) {
	const bodies: ModelBody[] = [];
	let next = 0;
	const fetchApi = (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
		if (String(input) !== MODEL_URL)
			return Promise.reject(new Error("An unexpected request reached the fake model."));
		bodies.push(JSON.parse(String(init?.body)) as ModelBody);
		const content = replies[Math.min(next, replies.length - 1)] ?? "";
		next += 1;
		const body = JSON.stringify({ choices: [{ message: { content } }] });
		return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "application/json" } }));
	};
	return { fetchApi, bodies };
}

type Story = Awaited<ReturnType<typeof import("@tensquads/domain/master").proofStory>>;

// Opens a live bus with the model config set. Restores the environment when the test ends.
async function session(
	t: test.TestContext,
	story: Story,
	accountId: string,
	replies: readonly string[],
	request = story.request,
) {
	const opened = await bus(t, accountId, `clerk-${accountId}`, request, TASK_ID);
	const previous = process.env.ADAPTERS;
	process.env.ADAPTERS = "real";
	const fake = fakeModel(replies);
	const env: BusObjectEnv = {
		ADAPTERS: "real",
		DATABASE_URL: url,
		OPENAI_API_KEY: "test-key",
		MASTER_MODEL: "unit-model",
		MASTER_REASONING_EFFORT: "medium",
		fetchApi: fake.fetchApi,
		masterReadPage: async (pageUrl: string) => story.pages[pageUrl] ?? { status: 404, body: "" },
		masterAudit: () => story.audit,
	};
	t.after(async () => {
		if (previous === undefined) delete process.env.ADAPTERS;
		else process.env.ADAPTERS = previous;
		await opened.database.close();
	});
	const target = new AccountBus({ storage: opened.storage, acceptWebSocket() {}, getWebSockets: () => [] }, env);
	return { opened, target, fake, accountId };
}

function texts(events: readonly { readonly text: string }[]): string[] {
	return events.map((event) => event.text);
}

function prose(story: Story, extra: string): string {
	return `${story.report.gap} ${extra}`;
}

const BAD: readonly { readonly name: string; readonly words: (gap: string) => string }[] = [
	{ name: "a number", words: (gap) => `${gap} Lobster costs 999.` },
	{ name: "an Arabic-Indic number", words: (gap) => `${gap} Lobster costs ١٢.` },
	{ name: "a number word", words: (gap) => `${gap} Lobster costs twelve.` },
	{ name: "a currency sign", words: (gap) => `${gap} Lobster costs $ more.` },
	{ name: "an offer word", words: (gap) => `${gap} Enjoy free delivery.` },
	{ name: "a percent", words: (gap) => `${gap} Ask for 20% off.` },
	{ name: "BOGO", words: (gap) => `${gap} The board says BOGO.` },
];

for (const [index, bad] of BAD.entries()) {
	test(`refuses ${bad.name} twice and stops in chat`, async (t) => {
		const story = await (await import("@tensquads/domain/master")).proofStory();
		const live = await session(t, story, `refuse-${index}`, [bad.words(story.report.gap)]);
		assert.equal((await post(live.target, live.accountId, reportEvent(`refuse-${index}`, story.report))).status, 200);
		const stored = await storedEvents(live.opened.storage);
		assert.equal(
			stored.some((event) => event.kind === "Approval"),
			false,
		);
		assert.equal(
			stored.some((event) => event.text === REFUSED),
			true,
		);
		assert.equal(live.fake.bodies.length, 2);
		const retry = live.fake.bodies[1]?.messages[0]?.content ?? "";
		assert.equal(retry.includes("Your last brief was refused:"), true);
		const chat = await live.opened.database.client.query<{ body: string }>(
			"SELECT body FROM messages WHERE account_id = $1 AND body = $2",
			[live.accountId, REFUSED],
		);
		assert.equal(chat.rows.length, 1);
	});
}

test("a brief that does not name the gap is refused twice", async (t) => {
	const story = await (await import("@tensquads/domain/master")).proofStory();
	const live = await session(t, story, "no-gap", ["Proof Kitchen serves Levantine food and fresh bread."]);
	assert.equal((await post(live.target, live.accountId, reportEvent("no-gap-report", story.report))).status, 200);
	const stored = await storedEvents(live.opened.storage);
	assert.equal(
		stored.some((event) => event.kind === "Approval"),
		false,
	);
	assert.equal(
		stored.some((event) => event.text === REFUSED),
		true,
	);
	assert.equal(live.fake.bodies.length, 2);
});

test("a refused brief gets one retry, and a passing retry is approved", async (t) => {
	const story = await (await import("@tensquads/domain/master")).proofStory();
	const good = prose(story, "Proof Kitchen keeps its salad prices in view.");
	const live = await session(t, story, "retry-pass", [BAD[0]?.words(story.report.gap) ?? "", good]);
	assert.equal((await post(live.target, live.accountId, reportEvent("retry-report", story.report))).status, 200);
	assert.equal(live.fake.bodies.length, 2);
	const approval = (await storedEvents(live.opened.storage)).find((event) => event.skill === "brief.write");
	assert.ok(approval);
	assert.equal((approval.payload.brief as { text: string }).text.startsWith(good), true);
});

test("a 150-word brief is refused", async (t) => {
	const story = await (await import("@tensquads/domain/master")).proofStory();
	const filler = Array.from({ length: 145 }, () => "sample").join(" ");
	const long = `${story.report.gap} ${filler}`;
	const live = await session(t, story, "long-brief", [long]);
	assert.equal((await post(live.target, live.accountId, reportEvent("long-report", story.report))).status, 200);
	const stored = await storedEvents(live.opened.storage);
	assert.equal(
		stored.some((event) => event.kind === "Approval"),
		false,
	);
	assert.equal(
		stored.some((event) => event.text === REFUSED),
		true,
	);
	assert.equal(live.fake.bodies.length, 2);
});

test("a valid brief is approved, and the approval text is the brief, Menu:, then the stored menu", async (t) => {
	const { renderItemSection } = await import("@tensquads/domain/master");
	const story = await (await import("@tensquads/domain/master")).proofStory();
	const good = prose(story, "Proof Kitchen serves Levantine food.");
	const live = await session(t, story, "valid-brief", [good]);
	assert.equal((await post(live.target, live.accountId, reportEvent("valid-report", story.report))).status, 200);
	const body = live.fake.bodies[0];
	assert.equal(body?.model, "unit-model");
	assert.equal(body?.reasoning_effort, "medium");
	const prompt = body?.messages[0]?.content ?? "";
	assert.equal(prompt.includes(story.request.businessName), true);
	assert.equal(prompt.includes(story.request.businessType), true);
	assert.equal(prompt.includes(story.report.gap), true);
	for (const source of story.report.sources) assert.equal(prompt.includes(source), true);
	const approval = (await storedEvents(live.opened.storage)).find((event) => event.skill === "brief.write");
	assert.ok(approval);
	const shown = (approval.payload.brief as { text: string }).text;
	assert.equal(shown, `${good}\n\nMenu:\n${renderItemSection(story.request.items)}`);
	assert.equal(approval.payload.subject, createHash("sha256").update(shown, "utf8").digest("hex"));
});

test("the stored brief mandate subject equals sha256 of the approval text", async (t) => {
	const story = await (await import("@tensquads/domain/master")).proofStory();
	const good = prose(story, "Proof Kitchen serves Levantine food.");
	const live = await session(t, story, "subject-brief", [good]);
	assert.equal((await post(live.target, live.accountId, reportEvent("subject-report", story.report))).status, 200);
	const approval = (await storedEvents(live.opened.storage)).find((event) => event.skill === "brief.write");
	assert.ok(approval);
	const shown = (approval.payload.brief as { text: string }).text;
	const sha = createHash("sha256").update(shown, "utf8").digest("hex");
	await decide(
		live.opened.database.db,
		{ accountId: live.accountId, mode: "account" },
		approval.id,
		true,
		undefined,
		async () => {},
		undefined,
		`clerk-${live.accountId}`,
	);
	const rows = await live.opened.database.db
		.select({ subject: schema.mandates.subject })
		.from(schema.mandates)
		.where(eq(schema.mandates.accountId, live.accountId));
	assert.equal(rows[0]?.subject, sha);
});

test("the build Task carries the stored items separately, and the brief has no menu", async (t) => {
	const story = await (await import("@tensquads/domain/master")).proofStory();
	const good = prose(story, "Proof Kitchen serves Levantine food.");
	const live = await session(t, story, "task-items", [good]);
	assert.equal((await post(live.target, live.accountId, reportEvent("task-report", story.report))).status, 200);
	const approval = (await storedEvents(live.opened.storage)).find((event) => event.skill === "brief.write");
	assert.ok(approval);
	await decide(
		live.opened.database.db,
		{ accountId: live.accountId, mode: "account" },
		approval.id,
		true,
		undefined,
		async () => {},
		undefined,
		`clerk-${live.accountId}`,
	);
	assert.equal((await post(live.target, live.accountId, userYes("task-yes"))).status, 200);
	const build = (await storedEvents(live.opened.storage)).find((event) => event.text.startsWith("Build the page."));
	assert.ok(build);
	assert.deepEqual(build.payload.items, story.request.items);
	const brief = (build.payload.brief as { text: string }).text;
	assert.equal(brief, good);
	assert.equal(brief.includes("Menu:"), false);
	for (const item of story.request.items) assert.equal(brief.includes(item.name), false);
	assert.equal(texts([build]).length, 1);
});

test("an empty business name stops in chat before any approval and never calls the model", async (t) => {
	const story = await (await import("@tensquads/domain/master")).proofStory();
	const live = await session(t, story, "empty-name", [prose(story, "Proof Kitchen serves Levantine food.")], {
		...story.request,
		businessName: "",
	});
	assert.equal((await post(live.target, live.accountId, reportEvent("name-report", story.report))).status, 200);
	const stored = await storedEvents(live.opened.storage);
	assert.equal(
		stored.some((event) => event.kind === "Approval"),
		false,
	);
	assert.equal(
		stored.some((event) => event.text === NO_NAME),
		true,
	);
	assert.equal(live.fake.bodies.length, 0);
});

test("an empty research finding stops in chat before any approval and never calls the model", async (t) => {
	const story = await (await import("@tensquads/domain/master")).proofStory();
	const live = await session(t, story, "empty-finding", [prose(story, "Proof Kitchen serves Levantine food.")]);
	const empty = { ...story.report, gap: "" };
	assert.equal((await post(live.target, live.accountId, reportEvent("finding-report", empty))).status, 200);
	const stored = await storedEvents(live.opened.storage);
	assert.equal(
		stored.some((event) => event.kind === "Approval"),
		false,
	);
	assert.equal(
		stored.some((event) => event.text === NO_FINDING),
		true,
	);
	assert.equal(live.fake.bodies.length, 0);
});
