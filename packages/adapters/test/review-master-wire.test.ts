import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { PublishedEvent } from "@tensquads/kernel";
import { AccountBus } from "../src/cloudflare-bus/account-bus.ts";
import { Storage } from "./bus-storage.ts";

const kit = join(import.meta.dirname, "../../../node_modules/@tensquads/agent-kit/package.json");

function objectBus(env: ConstructorParameters<typeof AccountBus>[1] = {}) {
	const storage = new Storage();
	const target = new AccountBus({ storage, acceptWebSocket() {}, getWebSockets: () => [] }, env);
	return { storage, target };
}

function reportEvent(report: unknown): PublishedEvent {
	return {
		id: "wire-report",
		time: "12:00",
		from: "market",
		to: "master",
		kind: "Result",
		skill: "report.write",
		text: "The report, the sources, and the evidence.",
		payload: { report },
		writes: [],
		trace: "tr_wire",
	};
}

async function skills(storage: Storage): Promise<string[]> {
	const rows = await storage.list<PublishedEvent>({ prefix: "event:" });
	return [...rows.values()].map((event) => event.skill);
}

test("a Result runs the master only when adapters are real", async () => {
	if (!existsSync(kit)) return;
	const { proofStory } = await import("@tensquads/domain/master");
	const story = await proofStory();
	const ports = {
		masterReadPage: async (url: string) => story.pages[url] ?? { status: 404, body: "" },
		masterAudit: () => story.audit,
		masterWriteBrief: () => story.prose,
	};
	const event = reportEvent(story.report);
	const quiet = objectBus(ports);
	const quietResponse = await quiet.target.fetch(
		new Request("https://bus/accept", {
			method: "POST",
			body: JSON.stringify({ accountId: "wire-test", event }),
		}),
	);
	assert.equal(quietResponse.status, 200);
	assert.deepEqual(await skills(quiet.storage), ["report.write"]);

	const real = objectBus({ ADAPTERS: "real", ...ports });
	await real.storage.put("state:business", JSON.stringify(story.request));
	const realResponse = await real.target.fetch(
		new Request("https://bus/accept", {
			method: "POST",
			body: JSON.stringify({ accountId: "wire-real", event }),
		}),
	);
	assert.equal(realResponse.status, 200);
	assert.equal((await skills(real.storage)).includes("brief.write"), true);
});
