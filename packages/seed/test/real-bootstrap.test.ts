import assert from "node:assert/strict";
import test from "node:test";
import { createRepositories, schema, writeAccount } from "@tensquads/adapters";

import { openPglite } from "../../adapters/test/pglite.ts";
import { bootstrapRealAccount, REAL_BUSINESS_KEY } from "../src/real-bootstrap.ts";

const platform = { accountId: "platform", mode: "platform" } as const;
const keptScope = { accountId: "kept", mode: "account" } as const;
const realScope = { accountId: "noon", mode: "account" } as const;
const now = new Date("2026-11-06T00:00:00.000Z");

function keptAccount() {
	return {
		account: {
			id: "kept",
			name: "Kept Cafe",
			owner: "Kept Owner",
			email: "kept@example.com",
			plan: "Starter" as const,
			tint: "#e7efff",
			squads: ["Cafe"],
			agents: 0,
			online: 0,
			tasks: 0,
			lastActive: "",
			status: "Active" as const,
			createdWeek: 1,
			started: "1 Nov 2026",
			mrr: 0,
			ltv: 0,
			mission: "Stay in place.",
		},
		agents: [],
		events: [
			{
				id: "kept-event",
				time: "09:00",
				from: "user",
				to: "master",
				kind: "Task" as const,
				skill: "task.route",
				text: "Keep this event.",
				payload: {},
				writes: [],
				trace: "kept-trace",
			},
		],
		store: {},
		rules: [],
		approvals: [],
		proposals: [],
		revenue: [],
		tiles: null,
		messages: [],
		masterName: "Master",
	};
}

test("the real bootstrap writes one account and leaves other tenants in place", async () => {
	const opened = await openPglite();
	try {
		await writeAccount(opened.db, keptAccount());
		await opened.db.insert(schema.agentImages).values({
			id: "kept-image",
			name: "Kept image",
			role: "Kept",
			tint: "#e7efff",
			tag: "kept-tag",
			version: "0.0.1",
			nextVersion: "0.0.1",
			updated: "",
			updatedFull: "",
			deployed: 0,
			onLatest: 0,
			status: "Draft",
			sortOrder: 9,
		});
		await opened.db.insert(schema.plans).values({ id: "Starter", name: "Starter", monthly: 49, sortOrder: 0 });
		await bootstrapRealAccount(opened.db, {
			accountId: "noon",
			businessName: "Noon Kitchen",
			businessType: "restaurant",
			ownerEmail: "owner@example.com",
			now,
		});
		const repos = createRepositories(opened.db);
		const accounts = await repos.platform.listAccounts(platform);
		assert.deepEqual(accounts.map((account) => account.id).sort(), ["kept", "noon"]);
		const noon = accounts.find((account) => account.id === "noon");
		assert.equal(noon?.name, "Noon Kitchen");
		assert.equal(noon?.owner, "owner@example.com");
		assert.equal(noon?.email, "owner@example.com");
		assert.equal(noon?.plan, "Starter");
		assert.equal(noon?.status, "Trial");
		assert.equal(noon?.mrr, 0);
		assert.deepEqual(noon?.squads, ["Master", "Market researcher", "Website builder"]);
		assert.deepEqual(
			(await repos.squads.listSquads(realScope)).map((squad) => squad.name),
			["Master", "Market researcher", "Website builder"],
		);
		const agents = await repos.squads.listAgents(realScope);
		assert.deepEqual(
			agents.map((agent) => agent.id),
			["master", "market", "website"],
		);
		assert.deepEqual(
			agents.map((agent) => agent.name),
			["Petra", "Machu", "Angkor"],
		);
		assert.deepEqual(
			agents.map((agent) => agent.skills.map((skill) => [skill.id, skill.runs, skill.gate])),
			[
				[
					["brief.write", 0, "Auto"],
					["task.route", 0, "Auto"],
					["approval.ask", 0, "Auto"],
					["check.run", 0, "Auto"],
				],
				[
					["web.search", 0, "Auto"],
					["maps.competitors", 0, "Auto"],
					["scrapling.read_page", 0, "Auto"],
					["market.analyse", 0, "Auto"],
					["report.write", 0, "Auto"],
					["competition.watch", 0, "Ask first"],
				],
				[
					["site.build", 0, "Auto"],
					["site.critique", 0, "Auto"],
					["site.preview", 0, "Auto"],
					["site.publish", 0, "Ask first"],
				],
			],
		);
		assert.equal(
			agents.every((agent) => agent.secrets.length === 0),
			true,
		);
		assert.deepEqual(await repos.bus.listEvents(realScope), []);
		assert.equal((await repos.bus.listEvents(keptScope)).length, 1);
		assert.equal((await repos.bus.listEvents(keptScope))[0]?.text, "Keep this event.");
		const store = await repos.bus.readStore(realScope);
		assert.deepEqual(store[REAL_BUSINESS_KEY], {
			businessName: "Noon Kitchen",
			businessType: "restaurant",
			items: [],
		});
		const images = await repos.catalog.listImages(platform);
		assert.deepEqual(
			images.map((image) => [image.id, image.tag]),
			[
				["market", "registry.agents.co/market:0.1.0"],
				["website", "registry.agents.co/website:0.1.0"],
				["kept-image", "kept-tag"],
			],
		);
		const plans = await repos.platform.listPlans(platform);
		assert.deepEqual(
			plans.map((plan) => [plan.id, plan.monthly]),
			[
				["Starter", 49],
				["Growth", 149],
				["Scale", 399],
			],
		);
		assert.equal((await repos.platform.listAccounts(keptScope))[0]?.name, "Kept Cafe");
	} finally {
		await opened.close();
	}
});
