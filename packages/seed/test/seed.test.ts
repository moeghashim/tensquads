import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryBus, createRepositories, saveWorkspace, squadId, traceFor } from "@tensquads/adapters";
import { type AgentImage, assembleTiles, type BusEvent, EMPTY_INBOX, TASKS_DONE_LABEL } from "@tensquads/domain";
import { sql } from "drizzle-orm";
import { extractDesign } from "../../../scripts/extract-design.mjs";
import { openPglite } from "../../adapters/test/pglite.ts";
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
		const storedTiles = design.tiles.filter((tile) => tile.label !== TASKS_DONE_LABEL);
		assert.equal(
			storedTiles.some((tile) => tile.label === TASKS_DONE_LABEL),
			false,
		);
		assert.deepEqual(tiles, storedTiles);
		assert.equal(
			tiles?.some((tile) => tile.label === TASKS_DONE_LABEL),
			false,
		);
		assert.equal(tiles?.[3]?.delta.codePointAt(0), 0x2212);
		const revenue = await repos.platform.dailyRevenue(demo);
		const shown = assembleTiles({
			stored: tiles,
			tasksDone: 331,
			revenue: revenue.map((day) => day.amount),
			saved: agents.map((agent) => agent.saved),
		});
		assert.equal(shown[0]?.value, "$8,420");
		assert.equal(shown[4]?.label, TASKS_DONE_LABEL);
		assert.equal(shown[4]?.value, "331");
		assert.equal(shown[5]?.value, "34h");
		assert.equal(await repos.platform.overviewTiles({ accountId: "leen", mode: "account" }), null);
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

test("the repository matches the design extract, field by field, in design order", async () => {
	const opened = await openPglite();
	try {
		await saveWorkspace(opened.db, workspaceFromDesign());
		const repos = createRepositories(opened.db);
		const accounts = design.seed.accounts.map((account) => ({
			...account,
			mission: design.companyMissions[account.id] ?? "[MISSION NOT SET]",
		}));
		const plans = (Object.keys(design.planPrice) as (keyof typeof design.planPrice)[]).map((name) => ({
			id: name,
			name,
			monthly: design.planPrice[name],
		}));
		const squads = design.seed.accounts.flatMap((account) =>
			account.squads.map((name) => ({ id: squadId(name), accountId: account.id, name })),
		);
		const approvals = design.seed.approvals.map((item) => ({ ...item, status: "Pending" as const }));
		const revenue = design.revenue.map((day) => ({ day: day.day, amount: day.amount }));
		assert.deepEqual(Object.keys(design.planPrice), ["Starter", "Growth", "Scale"]);
		assert.deepEqual(await repos.platform.listPlans(platform), plans);
		assert.deepEqual(await repos.platform.listAccounts(platform), accounts);
		assert.deepEqual(await repos.squads.listSquads(platform), squads);
		assert.deepEqual(
			await repos.squads.listSquads(demo),
			squads.filter((squad) => squad.accountId === "demo"),
		);
		assert.deepEqual(await repos.squads.listAgents(demo), design.seed.agents);
		assert.deepEqual(await repos.bus.listEvents(demo), design.seed.bus);
		const store = await repos.bus.readStore(demo);
		assert.deepEqual(store, design.seed.store);
		assert.deepEqual(Object.keys(store), Object.keys(design.seed.store));
		assert.equal(typeof store["inventory.low_stock"], "string");
		assert.equal(store["inventory.low_stock"], '["Black hoodie M","A3 frame"]');
		assert.deepEqual(await repos.policy.listRules(demo), design.seed.rules);
		assert.deepEqual(await repos.policy.listApprovals(demo), approvals);
		assert.deepEqual(await repos.policy.listMissionProposals(demo), design.seed.missionProposals);
		assert.deepEqual((await repos.conversation.thread(demo))?.messages, design.seed.chat);
		assert.deepEqual(await repos.platform.dailyRevenue(demo), revenue);
		assert.deepEqual(await repos.catalog.listImages(platform), design.seed.images);

		await reverseSort(opened.db);
		assert.deepEqual(await repos.platform.listPlans(platform), [...plans].reverse());
		assert.deepEqual(
			await repos.platform.listAccounts(platform),
			[...accounts].reverse().map((account) => ({ ...account, squads: [...account.squads].reverse() })),
		);
		assert.deepEqual(await repos.squads.listSquads(platform), [...squads].reverse());
		assert.deepEqual(await repos.squads.listAgents(demo), reverseAgents(design.seed.agents));
		assert.deepEqual(await repos.bus.listEvents(demo), [...design.seed.bus].reverse());
		assert.deepEqual(Object.keys(await repos.bus.readStore(demo)), [...Object.keys(design.seed.store)].reverse());
		assert.deepEqual(await repos.policy.listRules(demo), [...design.seed.rules].reverse());
		assert.deepEqual(await repos.policy.listApprovals(demo), [...approvals].reverse());
		assert.deepEqual(await repos.policy.listMissionProposals(demo), [...design.seed.missionProposals].reverse());
		assert.deepEqual((await repos.conversation.thread(demo))?.messages, [...design.seed.chat].reverse());
		assert.deepEqual(await repos.platform.dailyRevenue(demo), [...revenue].reverse());
		assert.deepEqual(await repos.catalog.listImages(platform), reverseImages(design.seed.images));
	} finally {
		await opened.close();
	}
});

async function reverseSort(db: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }): Promise<void> {
	const tables = [
		"accounts",
		"subscriptions",
		"squads",
		"masters",
		"agents",
		"machines",
		"skills",
		"rules",
		"approvals",
		"mission_proposals",
		"daily_revenue",
		"threads",
		"messages",
		"plans",
		"agent_images",
		"bugs",
		"feature_requests",
		"state_entries",
	];
	for (const table of tables) {
		await db.execute(sql`UPDATE ${sql.identifier(table)} SET sort_order = -sort_order`);
	}
	await db.execute(sql`UPDATE bus_events SET seq = -seq`);
}

function reverseAgents(agents: readonly (typeof design.seed.agents)[number][]) {
	return [...agents].reverse().map((agent) => ({ ...agent, skills: [...agent.skills].reverse() }));
}

function reverseImages(images: readonly AgentImage[]) {
	return [...images].reverse().map((image) => ({
		...image,
		bugs: [...image.bugs].reverse(),
		features: [...image.features].reverse(),
	}));
}

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
