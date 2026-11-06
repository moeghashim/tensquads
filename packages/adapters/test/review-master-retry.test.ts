import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { PublishedEvent } from "@tensquads/kernel";

import { AccountBus, type BusObjectEnv } from "../src/cloudflare-bus/account-bus.ts";
import { Storage } from "./bus-storage.ts";

const kit = join(import.meta.dirname, "../../../node_modules/@tensquads/agent-kit/package.json");

const rendered = {
	visibleText: "Proof Kitchen Levantine Mains Chicken tawook $14 Salads Fattoush [PRICE]",
	cssContent: [] as string[],
	linkTexts: ["Alpha Grill"],
	imageCount: 0,
	horizontalScroll: false,
	keyboard: true,
	contrast: true,
};

function objectBus(env: BusObjectEnv = {}) {
	const storage = new Storage();
	const target = new AccountBus({ storage, acceptWebSocket() {}, getWebSockets: () => [] }, env);
	return { storage, target };
}

function post(target: AccountBus, accountId: string, event: PublishedEvent): Promise<Response> {
	return target.fetch(
		new Request("https://bus/accept", {
			method: "POST",
			body: JSON.stringify({ accountId, event }),
		}),
	);
}

async function storedEvents(storage: Storage): Promise<PublishedEvent[]> {
	const rows = await storage.list<PublishedEvent>({ prefix: "event:" });
	return [...rows.values()];
}

function reportEvent(id: string, report: unknown): PublishedEvent {
	return {
		id,
		time: "12:00",
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

function approval(id: string, skill: string): PublishedEvent {
	return {
		id,
		time: "12:02",
		from: "user",
		to: "master",
		kind: "Approval",
		skill,
		text: "Yes.",
		payload: {},
		writes: [],
		trace: `tr_${id}`,
	};
}

function preview(id: string, previewUrl: string, choice: unknown): PublishedEvent {
	return {
		id,
		time: "12:03",
		from: "website",
		to: "master",
		kind: "Result",
		skill: "site.preview",
		text: "The preview is ready.",
		payload: { previewUrl, choice },
		writes: [],
		trace: `tr_${id}`,
	};
}

function published(id: string, publishedUrl: string): PublishedEvent {
	return {
		id,
		time: "12:05",
		from: "website",
		to: "master",
		kind: "Result",
		skill: "site.publish",
		text: "The page is published.",
		payload: { publishedUrl },
		writes: [],
		trace: `tr_${id}`,
	};
}

type Story = Awaited<ReturnType<typeof import("@tensquads/domain/master")["proofStory"]>>;

function ports(story: Story): BusObjectEnv {
	return {
		ADAPTERS: "real",
		masterReadPage: async (url: string) => story.pages[url] ?? { status: 404, body: "" },
		masterAudit: () => story.audit,
		masterBrowser: async () => rendered,
	};
}

async function seedBusiness(storage: Storage, request: Story["request"]): Promise<void> {
	await storage.put("state:business", JSON.stringify(request));
}

test("the real flag alone wires the master", { timeout: 20_000 }, async () => {
	if (!existsSync(kit)) return;
	const { proofStory } = await import("@tensquads/domain/master");
	const story = await proofStory();
	const { storage, target } = objectBus({ ADAPTERS: "real" });
	const response = await post(target, "actual-env", reportEvent("actual-report", story.report));
	assert.equal(response.status, 200);
	const stored = await storedEvents(storage);
	assert.equal(stored.length, 2);
	assert.equal(
		stored.some((event) => event.kind === "Task"),
		true,
	);
	assert.equal(
		stored.some((event) => event.skill === "brief.write"),
		false,
	);
});

test("one successful result adds one brief and a foreign account adds nothing", async () => {
	if (!existsSync(kit)) return;
	const { proofStory } = await import("@tensquads/domain/master");
	const story = await proofStory();
	const { storage, target } = objectBus(ports(story));
	await seedBusiness(storage, story.request);
	const event = reportEvent("review-report", story.report);
	assert.equal((await post(target, "review-owner", event)).status, 200);
	assert.equal((await post(target, "review-owner", event)).status, 200);
	const foreign = await post(target, "foreign", reportEvent("review-foreign", story.report));
	assert.equal(foreign.status, 200);
	assert.equal(((await foreign.json()) as { seen: boolean }).seen, true);
	assert.equal((await storedEvents(storage)).length, 2);
});

test("a user approval of the brief and of publish reaches the website", async () => {
	if (!existsSync(kit)) return;
	const { proofStory } = await import("@tensquads/domain/master");
	const story = await proofStory();
	const { storage, target } = objectBus(ports(story));
	await seedBusiness(storage, story.request);
	assert.equal((await post(target, "proof", reportEvent("apr-report", story.report))).status, 200);
	assert.equal((await post(target, "proof", approval("apr-yes-brief", "brief.write"))).status, 200);
	assert.equal((await post(target, "proof", preview("apr-preview", story.previewUrl, story.choice))).status, 200);
	assert.equal((await post(target, "proof", approval("apr-yes-publish", "approval.ask"))).status, 200);
	assert.equal((await post(target, "proof", published("apr-publish", story.publishedUrl))).status, 200);
	const stored = await storedEvents(storage);
	assert.equal(
		stored.some((event) => event.text.startsWith("Build the page.")),
		true,
	);
	assert.equal(
		stored.some((event) => event.text === "Publish the page."),
		true,
	);
	assert.equal(
		stored.some((event) => event.text.includes("The published URL is not the account site.")),
		false,
	);
});
