import assert from "node:assert/strict";
import test from "node:test";

import { TASKS_DONE_LABEL } from "@tensquads/domain";

import type { OverviewData } from "./types.ts";
import { presentOverview } from "./view.ts";

const proposal = {
	id: "mp1",
	agentName: "Inventory",
	tint: "#000",
	title: "Proposed mission",
	mission: "Keep stock under 30 days.",
	chips: ["Stock-outs: 0"],
	proposed: true,
	revising: false,
};

const approval = {
	id: "ap1",
	agentName: "Support",
	tint: "#000",
	amount: "$42",
	title: "Refund $42",
	detail: "Order A-1012",
};

function data(): OverviewData {
	return {
		accountId: "demo",
		greeting: "Good morning, Moe",
		mission: "Run the store",
		online: "4 of 5 squads online",
		tiles: [{ label: TASKS_DONE_LABEL, value: "331", delta: "This week", deltaColor: "#5d5d5d" }],
		bars: [],
		count: 2,
		empty: false,
		emptyText: "Nothing waiting. Your squads are working inside their limits.",
		proposals: [proposal],
		approvals: [approval],
		agents: [
			{
				id: "inventory",
				name: "Inventory",
				role: "Stock",
				tint: "#000",
				last: "Checked stock",
				tasks: 31,
				success: "90%",
				saved: "2h",
				mission: "",
				contribution: 10,
			},
			{
				id: "support",
				name: "Support",
				role: "Customers",
				tint: "#000",
				last: "Checked a refund",
				tasks: 96,
				success: "90%",
				saved: "2h",
				mission: "",
				contribution: 10,
			},
		],
		masterName: "Master",
	};
}

test("an approval click removes that card and lowers the count", () => {
	const shown = presentOverview(data(), [{ key: "spend:ap1", kind: "spend-approve", id: "ap1" }]);
	assert.equal(shown.approvals.length, 0);
	assert.equal(shown.count, 1);
	assert.equal(shown.proposals.length, 1);
	assert.equal(shown.empty, false);
	assert.equal(shown.emptyText, "");
	assert.equal(shown.tiles.find((tile) => tile.label === TASKS_DONE_LABEL)?.value, "332");
	assert.equal(shown.agents.find((agent) => agent.name === "Support")?.tasks, 97);
	assert.equal(shown.agents.find((agent) => agent.name === "Support")?.last, "Refund $42 (approved)");
	assert.equal(shown.agents.find((agent) => agent.name === "Inventory")?.tasks, 31);
});

test("a mission approval adds no task", () => {
	const shown = presentOverview(data(), [{ key: "mission:mp1", kind: "mission-approve", id: "mp1" }]);
	assert.equal(shown.tiles.find((tile) => tile.label === TASKS_DONE_LABEL)?.value, "331");
	assert.equal(shown.agents.find((agent) => agent.name === "Inventory")?.tasks, 31);
});

test("a declined approval adds no task", () => {
	const shown = presentOverview(data(), [{ key: "spend:ap1", kind: "spend-decline", id: "ap1" }]);
	assert.equal(shown.approvals.length, 0);
	assert.equal(shown.tiles.find((tile) => tile.label === TASKS_DONE_LABEL)?.value, "331");
	assert.equal(shown.agents.find((agent) => agent.name === "Support")?.tasks, 96);
	assert.equal(shown.agents.find((agent) => agent.name === "Support")?.last, "Checked a refund");
});

test("a mission approval shows the mission on the agent and lowers the count", () => {
	const shown = presentOverview(data(), [{ key: "mission:mp1", kind: "mission-approve", id: "mp1" }]);
	assert.equal(shown.proposals.length, 0);
	assert.equal(shown.count, 1);
	assert.equal(shown.agents[0]?.mission, "Keep stock under 30 days.");
	assert.equal(shown.agents[0]?.contribution, 0);
});

test("ask for another shows the revising card and lowers the count", () => {
	const shown = presentOverview(data(), [{ key: "mission:mp1", kind: "mission-revise", id: "mp1" }]);
	assert.equal(shown.proposals[0]?.title, "Revised mission on its way");
	assert.equal(shown.proposals[0]?.revising, true);
	assert.equal(shown.proposals[0]?.proposed, false);
	assert.equal(shown.count, 1);
});

test("the last decision shows the empty inbox sentence", () => {
	const shown = presentOverview(data(), [
		{ key: "spend:ap1", kind: "spend-approve", id: "ap1" },
		{ key: "mission:mp1", kind: "mission-approve", id: "mp1" },
	]);
	assert.equal(shown.empty, true);
	assert.equal(shown.count, 0);
	assert.equal(shown.emptyText, "Nothing waiting. Your squads are working inside their limits.");
});

test("a settled server row is not counted twice", () => {
	const server = data();
	const without = { ...server, approvals: [], count: 1 };
	const shown = presentOverview(without, [{ key: "spend:ap1", kind: "spend-approve", id: "ap1" }]);
	assert.equal(shown.count, 1);
	assert.equal(shown.tiles.find((tile) => tile.label === TASKS_DONE_LABEL)?.value, "331");
});
