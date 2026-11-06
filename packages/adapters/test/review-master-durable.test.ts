import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { PublishedEvent } from "@tensquads/kernel";

import { AccountBus, type BusObjectEnv } from "../src/cloudflare-bus/account-bus.ts";
import { Storage } from "./bus-storage.ts";

const kit = join(import.meta.dirname, "../../../node_modules/@tensquads/agent-kit/package.json");
const kitHook = join(import.meta.dirname, "../../../scripts/register-kit.mjs");

const rendered = {
	visibleText: "Proof Kitchen",
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

type Story = Awaited<ReturnType<typeof import("@tensquads/domain/master")["proofStory"]>>;

function ports(story: Story, writeBrief?: () => string): BusObjectEnv {
	return {
		ADAPTERS: "real",
		masterReadPage: async (url: string) => story.pages[url] ?? { status: 404, body: "" },
		masterAudit: () => story.audit,
		...(writeBrief ? { masterWriteBrief: writeBrief } : {}),
		masterBrowser: async () => rendered,
	};
}

test("a failed output write stays open and the next delivery emits one approval", async () => {
	if (!existsSync(kit)) return;
	const { proofStory } = await import("@tensquads/domain/master");
	const story = await proofStory();
	let calls = 0;
	const { storage, target } = objectBus(
		ports(story, () => {
			calls += 1;
			return story.brief;
		}),
	);
	await storage.put("state:business", JSON.stringify(story.request));
	const native = storage.kv.put;
	let fail = true;
	storage.kv.put = (key, value) => {
		if (fail && key === "event:2") {
			fail = false;
			throw new Error("commit-failed");
		}
		native(key, value);
	};
	const event = reportEvent("commit-report", story.report);
	await assert.rejects(() => post(target, "commit-owner", event), /commit-failed/);
	assert.equal(await storage.get("master-done:commit-report"), undefined);
	assert.equal(
		(await storedEvents(storage)).some((item) => item.skill === "brief.write"),
		false,
	);
	assert.equal((await post(target, "commit-owner", event)).status, 200);
	await target.alarm();
	const stored = await storedEvents(storage);
	assert.equal(stored.filter((item) => item.skill === "brief.write").length, 1);
	assert.equal(calls, 2);
	assert.equal(await storage.get("master-done:commit-report"), true);
});

test("a fresh process emits the build task from the stored phase", async () => {
	if (!existsSync(kit)) return;
	const { proofStory } = await import("@tensquads/domain/master");
	const story = await proofStory();
	const { storage, target } = objectBus(ports(story, () => story.brief));
	await storage.put("state:business", JSON.stringify(story.request));
	assert.equal((await post(target, "phase-owner", reportEvent("phase-report", story.report))).status, 200);
	const directory = mkdtempSync(join(tmpdir(), "phase-owner-"));
	const file = join(directory, "storage.json");
	writeFileSync(file, JSON.stringify([...storage.rows]));
	const child = fileURLToPath(new URL("./review-master-phase-child.ts", import.meta.url));
	const result = spawnSync(process.execPath, ["--experimental-strip-types", "--import", kitHook, child, file], {
		encoding: "utf8",
	});
	rmSync(directory, { recursive: true, force: true });
	assert.equal(result.status, 0, result.stderr);
	const body = JSON.parse(result.stdout) as { businessName: string; items: number };
	assert.equal(body.businessName, "Proof Kitchen");
	assert.equal(body.items, story.request.items.length);
});

test("a missing stored request does not invent a business", async () => {
	if (!existsSync(kit)) return;
	const { proofStory } = await import("@tensquads/domain/master");
	const story = await proofStory();
	const { storage, target } = objectBus(ports(story, () => story.brief));
	assert.equal((await post(target, "stored-gap", reportEvent("stored-report", story.report))).status, 200);
	await assert.rejects(
		() =>
			post(target, "stored-gap", {
				id: "stored-yes",
				time: "12:02",
				from: "user",
				to: "master",
				kind: "Approval",
				skill: "brief.write",
				text: "Yes.",
				payload: {},
				writes: [],
				trace: "tr_stored_yes",
			}),
		/The business is not stored\./,
	);
	const stored = await storedEvents(storage);
	assert.equal(
		stored.some((item) => item.text.startsWith("Build the page.")),
		false,
	);
	assert.equal(JSON.stringify(stored).includes('"businessName":"Account"'), false);
});

test("the model id comes from MASTER_MODEL", async () => {
	if (!existsSync(kit)) return;
	const { proofStory } = await import("@tensquads/domain/master");
	const story = await proofStory();
	let seen = "";
	const { target, storage } = objectBus({
		...ports(story),
		OPENAI_API_KEY: "test-key",
		MASTER_MODEL: "unit-model",
		fetchApi: async (_url, init) => {
			seen = String(init?.body ?? "");
			return new Response(JSON.stringify({ choices: [{ message: { content: story.brief } }] }));
		},
	});
	await storage.put("state:business", JSON.stringify(story.request));
	assert.equal((await post(target, "model-owner", reportEvent("model-report", story.report))).status, 200);
	assert.equal(JSON.parse(seen).model, "unit-model");
	assert.equal(seen.includes("test-key"), false);
});

test("a missing MASTER_MODEL does not call the model", async () => {
	if (!existsSync(kit)) return;
	const { proofStory } = await import("@tensquads/domain/master");
	const story = await proofStory();
	let called = false;
	const { target, storage } = objectBus({
		...ports(story),
		OPENAI_API_KEY: "test-key",
		fetchApi: async () => {
			called = true;
			return new Response("no");
		},
	});
	await storage.put("state:business", JSON.stringify(story.request));
	await assert.rejects(
		() => post(target, "model-gap", reportEvent("model-gap", story.report)),
		/The model is not configured\./,
	);
	assert.equal(called, false);
});
