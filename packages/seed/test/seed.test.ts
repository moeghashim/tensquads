import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryBus, createRepositories, openPglite, saveWorkspace, traceFor } from "@tensquads/adapters";
import { type BusEvent, EMPTY_INBOX } from "@tensquads/domain";

import { extractDesign } from "../../../scripts/extract-design.mjs";
import { design, homepageAgents, signupAgents, workspaceFromDesign } from "../src/index.ts";

const platform = { accountId: "platform", mode: "platform" } as const;
const demo = { accountId: "demo", mode: "account" } as const;

test("the committed extract matches the design files", () => {
	assert.deepEqual(extractDesign(), design);
});

test("the seed computes the nine numbers", async () => {
	const opened = await openPglite();
	try {
		const snapshot = workspaceFromDesign();
		await saveWorkspace(opened.db, snapshot);
		await saveWorkspace(opened.db, snapshot);
		const repos = createRepositories(opened.db);
		const totals = await repos.platform.totals(platform);
		assert.equal(totals.accounts, 9);
		assert.equal(totals.agents, 66);
		assert.equal(totals.squads, 17);
		assert.equal(totals.mrr, 1294);
		assert.equal(totals.allTime, 14568);
		assert.equal(totals.tasksDone, 331);
		assert.equal(totals.images, 7);
		assert.equal(totals.openBugs, 8);
		assert.equal(totals.featuresRequested, 15);

		const agents = await repos.squads.listAgents(demo);
		assert.equal(agents.length, 5);
		assert.equal(agents.filter((agent) => agent.on).length, 4);
		assert.equal(
			agents.reduce((sum, agent) => sum + agent.tasks, 0),
			331,
		);
		const ids = agents.map((agent) => agent.id);
		assert.equal(ids.includes("market"), false);
		assert.equal(ids.includes("website"), false);
		assert.equal(
			homepageAgents.some((agent) => agent.name === "Market researcher" && agent.tint === "#fde2f3"),
			true,
		);
		assert.equal(
			homepageAgents.some((agent) => agent.name === "Website builder" && agent.tint === "#e5e9f0"),
			true,
		);
		assert.equal(
			signupAgents.new.some((agent) => agent.name === "Market researcher"),
			true,
		);
		assert.equal(
			signupAgents.existing.some((agent) => agent.name === "Website builder"),
			true,
		);

		const tiles = await repos.platform.overviewTiles(demo);
		assert.deepEqual(tiles, design.tiles);
		assert.equal(tiles?.[4]?.value, "331");
		assert.equal(tiles?.[3]?.delta.codePointAt(0), 0x2212);
		assert.equal(await repos.platform.overviewTiles({ accountId: "leen", mode: "account" }), null);
		const revenue = await repos.platform.dailyRevenue(demo);
		assert.equal(revenue.length, 14);
		assert.equal(revenue[0]?.day, "2026-10-14");
		assert.equal(revenue[0]?.amount, 980);
		assert.equal(revenue[13]?.day, "2026-10-27");
		assert.equal(revenue[13]?.amount, 1440);
		assert.equal((await repos.platform.dailyRevenue({ accountId: "leen", mode: "account" })).length, 0);

		const inbox = await repos.policy.inbox(demo);
		assert.equal(inbox.count, 4);
		assert.equal(inbox.empty, false);
		assert.equal(EMPTY_INBOX, design.emptyInbox);
		const thread = await repos.conversation.thread(demo);
		assert.equal(thread?.messages.length, 5);
		const store = await repos.bus.readStore(demo);
		assert.equal(store["policy.refund_auto_limit"], 50);
		assert.equal((await repos.squads.master(demo))?.name, "Master");
	} finally {
		await opened.close();
	}
});

test("the memory bus walks the scripted events", () => {
	const bus = createMemoryBus({
		events: design.seed.bus,
		script: design.script.map((event) => ({ ...event, writes: event.writes ?? [] })),
		store: { ...design.seed.store },
		trace: traceFor,
	});
	assert.equal(bus.events().length, 9);
	const first = bus.nextEvent() as BusEvent | undefined;
	assert.equal(first?.id, "e100");
	assert.equal(first?.time, "11:03");
	assert.equal(first?.text, "Daily stock check");
	const second = bus.nextEvent() as BusEvent | undefined;
	assert.equal(second?.id, "e101");
	assert.equal(bus.store()["inventory.low_stock"], '["Black hoodie M","A3 frame"]');
	for (let index = 0; index < 6; index += 1) {
		bus.nextEvent();
	}
	assert.equal(bus.events().length, 17);
	assert.equal(bus.events()[16]?.id, "e107");
});
