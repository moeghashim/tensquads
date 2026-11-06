import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { PublishedEvent } from "@tensquads/kernel";

import { AccountBus, type BusObjectEnv } from "../src/cloudflare-bus/account-bus.ts";
import type { BusNamespace } from "../src/cloudflare-bus/http.ts";
import { deliverUserToMaster, userMasterEvent } from "../src/neon/commands/approval-bus.ts";
import { Storage } from "./bus-storage.ts";

const kit = join(import.meta.dirname, "../../../node_modules/@tensquads/agent-kit/package.json");
const layout = {
	visibleText: "Proof Kitchen",
	cssContent: [] as string[],
	linkTexts: [] as string[],
	imageCount: 0,
	keyboard: true,
	contrast: true,
	horizontalScroll: false,
};

type Story = Awaited<ReturnType<typeof import("@tensquads/domain/master")["proofStory"]>>;

function report(id: string, story: Story): PublishedEvent {
	return {
		id,
		time: "12:00",
		from: "market",
		to: "master",
		kind: "Result",
		skill: "report.write",
		text: "Report",
		payload: { report: story.report },
		writes: [],
		trace: id,
	};
}

function post(target: AccountBus, accountId: string, event: unknown): Promise<Response> {
	return target.fetch(
		new Request("https://bus/accept", {
			method: "POST",
			body: JSON.stringify({ accountId, event }),
		}),
	);
}

async function setup(id: string, story: Story) {
	const storage = new Storage();
	await storage.put("state:business", JSON.stringify(story.request));
	const env: BusObjectEnv = {
		ADAPTERS: "real",
		masterReadPage: async (url: string) => story.pages[url] ?? { status: 404, body: "" },
		masterWriteBrief: () => story.prose,
		masterBrowser: async () => layout,
	};
	const target = new AccountBus({ storage, acceptWebSocket() {}, getWebSockets: () => [] }, env);
	return { storage, target, id };
}

async function storedEvents(storage: Storage): Promise<PublishedEvent[]> {
	const rows = await storage.list<PublishedEvent>({ prefix: "event:" });
	return [...rows.values()];
}

test("an application yes uses the skill the master asked about", async () => {
	if (!existsSync(kit)) return;
	const { proofStory } = await import("@tensquads/domain/master");
	const story = await proofStory();
	const { storage, target, id } = await setup("fourth-yes", story);
	await post(target, id, report("report-app", story));
	const asked = (await storedEvents(storage)).find((event) => event.to === "user" && event.kind === "Approval");
	assert.ok(asked);
	const yes = userMasterEvent({
		id: "m-01",
		ok: true,
		title: asked.text,
		by: "Moe",
		at: new Date("2026-11-05T12:00:00.000Z"),
	});
	assert.equal(yes.skill, asked.skill);
	await post(target, id, yes);
	const built = (await storedEvents(storage)).filter((event) => event.text.startsWith("Build the page."));
	assert.equal(built.length, 1);
	assert.equal((await storage.get<{ phase: string }>("master-phase"))?.phase, "building");

	await post(target, id, {
		id: "preview-app",
		time: "12:01",
		from: "website",
		to: "master",
		kind: "Result",
		skill: "site.preview",
		text: "preview",
		payload: { previewUrl: story.previewUrl, choice: story.choice },
		writes: [],
	});
	const publishAsk = (await storedEvents(storage)).find((event) => event.text === "Publish the site?");
	assert.ok(publishAsk);
	const publishYes = userMasterEvent({
		id: "m-02",
		ok: true,
		title: publishAsk.text,
		by: "Moe",
		at: new Date("2026-11-05T12:02:00.000Z"),
	});
	assert.equal(publishYes.skill, publishAsk.skill);
	await post(target, id, publishYes);
	const published = (await storedEvents(storage)).filter((event) => event.text === "Publish the page.");
	assert.equal(published.length, 1);
	assert.equal((await storage.get<{ phase: string }>("master-phase"))?.phase, "publishing");
});

test("a failed marker write rolls back the input and the next delivery runs the master", async () => {
	if (!existsSync(kit)) return;
	const { proofStory } = await import("@tensquads/domain/master");
	const story = await proofStory();
	const { storage, target, id } = await setup("fourth-marker", story);
	const nativePut = storage.put.bind(storage);
	const nativeKvPut = storage.kv.put.bind(storage.kv);
	let fail = true;
	const crash = (key: string) => {
		if (fail && key === "master-open:gap-report") {
			fail = false;
			throw new Error("crash-window");
		}
	};
	storage.put = async (key, value) => {
		crash(key);
		return nativePut(key, value);
	};
	storage.kv.put = (key, value) => {
		crash(key);
		return nativeKvPut(key, value);
	};
	await assert.rejects(() => post(target, id, report("gap-report", story)), /crash-window/);
	assert.equal(await storage.get("seen:gap-report"), undefined);
	await post(target, id, report("gap-report", story));
	await target.alarm();
	assert.equal((await storage.get<{ phase: string }>("master-phase"))?.phase, "brief");
});

test("live fetch rejects a response whose bytes add a BOM", async () => {
	if (!existsSync(kit)) return;
	const { proofStory } = await import("@tensquads/domain/master");
	const { openMaster } = await import("../src/cloudflare-bus/master-live.ts");
	const story = await proofStory();
	const storage = new Storage();
	await storage.put("state:business", JSON.stringify(story.request));
	const raw = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(story.pageHtml)]);
	const previous = globalThis.fetch;
	globalThis.fetch = async (input) => {
		const url = String(input);
		if (url === story.previewUrl) return new Response(raw);
		const page = story.pages[url];
		return new Response(page?.body ?? "", { status: page?.status ?? 404 });
	};
	try {
		const master = await openMaster(
			{
				ADAPTERS: "real",
				masterWriteBrief: () => story.prose,
				masterBrowser: async () => layout,
			},
			"fourth-bom",
			storage,
		);
		assert.ok(master);
		await master.accept(report("bom-report", story));
		await master.accept({
			id: "yes-bom",
			from: "user",
			to: "master",
			kind: "Approval",
			skill: "brief.write",
			text: "Yes",
			payload: {},
			writes: [],
		});
		const output = await master.accept({
			id: "preview-bom",
			from: "website",
			to: "master",
			kind: "Result",
			skill: "site.preview",
			text: "preview",
			payload: { previewUrl: story.previewUrl, choice: story.choice },
			writes: [],
		});
		assert.equal(
			output.some((event) => event.text === "Publish the site?"),
			false,
		);
		assert.equal(master.snapshot().previewHtml, undefined);
	} finally {
		globalThis.fetch = previous;
	}
});

test("the injected Durable Object receives the app approval", async () => {
	const seen: { event?: { skill?: string } }[] = [];
	const namespace: BusNamespace = {
		idFromName: () => "id",
		get: () => ({
			fetch: async (_input, init) => {
				seen.push(JSON.parse(String(init?.body)) as { event?: { skill?: string } });
				return Response.json({ seen: false, seq: 1 });
			},
		}),
	};
	const previous = process.env.ADAPTERS;
	process.env.ADAPTERS = "real";
	try {
		const event = userMasterEvent({
			id: "m-01",
			ok: true,
			title: "Build the site with this brief?",
			by: "Moe",
			at: new Date("2026-11-05T12:00:00.000Z"),
		});
		await assert.rejects(() => deliverUserToMaster("fourth-deliver", event), /The bus is not configured\./);
		await deliverUserToMaster("fourth-deliver", event, namespace);
		assert.equal(event.skill, "brief.write");
		assert.equal(seen[0]?.event?.skill, "brief.write");
	} finally {
		if (previous === undefined) delete process.env.ADAPTERS;
		else process.env.ADAPTERS = previous;
	}
});
