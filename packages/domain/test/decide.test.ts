import assert from "node:assert/strict";
import test from "node:test";

import {
	type Approval,
	askRevise,
	assembleTiles,
	BLANK,
	decideApproval,
	decideMission,
	EMPTY_INBOX,
	greetingLine,
	greetingName,
	inboxCount,
	inboxIsEmpty,
	limitKeyFor,
	type MissionProposal,
	matchedRule,
	onlineLine,
	policyVersion,
	type RevenueBar,
	type Rule,
	revenueBars,
	TASKS_DONE_LABEL,
} from "../src/index.ts";

const agent = {
	id: "support",
	tasks: 96,
	last: "Asked for tracking",
	mission: "",
	targets: [] as const,
	contribution: 10,
};

const approval: Approval = {
	id: "ap1",
	agent: "support",
	title: "Refund $42 on #A-1012",
	detail: "Print arrived creased.",
	amount: "$42",
	status: "Pending",
};

const proposal: MissionProposal = {
	id: "mp-inventory",
	agent: "inventory",
	mission: "Never run out of a top-20 product and keep stock under 30 days of cover.",
	targets: [
		["Stock-outs", "0"],
		["Days of stock", "under 30"],
	],
	status: "Proposed",
};

test("approve adds one task and sets last", () => {
	const result = decideApproval(agent, approval, true);
	assert.equal(result.agent.tasks, 97);
	assert.equal(result.agent.last, "Refund $42 on #A-1012 (approved)");
	assert.equal(result.approval.status, "Approved");
});

test("decline changes no agent", () => {
	const result = decideApproval(agent, approval, false);
	assert.equal(result.agent.tasks, agent.tasks);
	assert.equal(result.agent.last, agent.last);
	assert.equal(result.approval.status, "Declined");
});

test("approving a mission adds no task", () => {
	const result = decideMission(agent, proposal, true);
	assert.equal(result.agent.tasks, agent.tasks);
	assert.notEqual(agent.contribution, 0);
	assert.equal(result.agent.contribution, 0);
	assert.equal(result.agent.mission, proposal.mission);
	assert.deepEqual(result.agent.targets, [
		["Stock-outs", "—", "0"],
		["Days of stock", "—", "under 30"],
	]);
	assert.equal(result.proposal.status, "Approved");
});

test("ask to revise adds one Revising proposal when that agent has none", () => {
	const current = {
		...agent,
		mission: "Ship every order.",
		targets: [["Fulfilment time", "2.1 days", "1 day"]] as const,
	};
	const created = askRevise(current, [], "mp-support-1");
	assert.deepEqual(created.proposals, [
		{
			id: "mp-support-1",
			agent: "support",
			mission: "Ship every order.",
			targets: [["Fulfilment time", "1 day"]],
			status: "Revising",
		},
	]);
	assert.equal(askRevise(current, created.proposals, "mp-support-2").proposals, created.proposals);
	const proposed = { ...proposal, agent: "support" };
	const blocked = [proposed];
	assert.equal(askRevise(current, blocked, "mp-support-3").proposals, blocked);
	const approved = { ...proposed, status: "Approved" as const };
	const again = askRevise(current, [approved], "mp-support-4");
	assert.equal(again.proposals[1]?.id, "mp-support-4");
	assert.equal(again.proposals[1]?.status, "Revising");
	assert.equal(again.proposals[1]?.mission, current.mission);
});

test("declining a mission sets Revising", () => {
	const result = decideMission(agent, proposal, false);
	assert.equal(result.proposal.status, "Revising");
	assert.equal(result.agent.tasks, agent.tasks);
	assert.equal(result.agent.mission, agent.mission);
});

test("the count is pending approvals plus Proposed proposals", () => {
	assert.equal(inboxCount([approval], [proposal]), 2);
	const declined = decideApproval(agent, approval, false).approval;
	const revising = decideMission(agent, proposal, false).proposal;
	assert.equal(inboxCount([declined], [revising]), 0);
	assert.equal(inboxIsEmpty([declined], [revising]), false);
	const removed = decideMission(agent, proposal, true).proposal;
	assert.equal(inboxIsEmpty([declined], [removed]), true);
	assert.equal(EMPTY_INBOX, "Nothing waiting. Your squads are working inside their limits.");
});

test("the greeting uses the first word, and an email uses the part before @", () => {
	assert.equal(greetingName("Moe Ghashim"), "Moe");
	assert.equal(greetingName("sq-1@example.com"), "sq-1");
	assert.equal(greetingName("  "), BLANK);
	assert.equal(greetingLine("Moe Ghashim"), "Good morning, Moe");
	assert.equal(greetingLine(""), `Good morning, ${BLANK}`);
	assert.equal(onlineLine(4, 5), "4 of 5 squads online");
});

test("tiles compute tasks, revenue, and hours, and a stored tasks tile is ignored", () => {
	const stored = [
		{ label: "Revenue", value: "$1", delta: "+12% vs last week", deltaColor: "#00692a" },
		{ label: "Orders", value: "186", delta: "+8% vs last week", deltaColor: "#00692a" },
		{ label: "Average order", value: "$45.27", delta: "+4% vs last week", deltaColor: "#00692a" },
		{ label: "Profit margin", value: "31%", delta: "−1 pt vs last week", deltaColor: "#911e1b" },
		{ label: TASKS_DONE_LABEL, value: "999", delta: "stored", deltaColor: "#000000" },
		{ label: "Hours saved", value: "1h", delta: "This week", deltaColor: "#5d5d5d" },
	];
	const shown = assembleTiles({
		stored,
		tasksDone: 331,
		revenue: [1, 2, 3, 4, 5, 6, 7],
		saved: ["11.5h", "9h", "6h", "4h", "3.5h"],
	});
	assert.equal(shown.filter((tile) => tile.label === TASKS_DONE_LABEL).length, 1);
	assert.equal(shown[0]?.value, "$28");
	assert.equal(shown[0]?.delta, "+12% vs last week");
	assert.equal(shown[4]?.value, "331");
	assert.equal(shown[4]?.delta, "This week");
	assert.equal(shown[5]?.value, "34h");
	const blank = assembleTiles({ stored: null, tasksDone: 0, revenue: [], saved: [] });
	assert.deepEqual(
		blank.map((tile) => tile.value),
		[BLANK, BLANK, BLANK, BLANK, "0", BLANK],
	);
	assert.equal(blank[0]?.delta, "\u00a0");
	assert.equal(blank[4]?.delta, "This week");
	const short = assembleTiles({
		stored,
		tasksDone: 1,
		revenue: [10, 5],
		saved: ["nope"],
	});
	assert.equal(short[0]?.value, "$15");
	assert.equal(short[5]?.value, BLANK);
});

test("fourteen revenue rows use the design height, fill, and day label", () => {
	const rows = [
		{ day: "2026-10-14", amount: 980 },
		{ day: "2026-10-15", amount: 1040 },
		{ day: "2026-10-16", amount: 1020 },
		{ day: "2026-10-17", amount: 1110 },
		{ day: "2026-10-18", amount: 1060 },
		{ day: "2026-10-19", amount: 1150 },
		{ day: "2026-10-20", amount: 1160 },
		{ day: "2026-10-21", amount: 1010 },
	];
	const bars = revenueBars(rows);
	const first: RevenueBar | undefined = bars[0];
	assert.equal(first?.h, 65);
	assert.equal(first?.fill, "#c9c9c9");
	assert.equal(first?.label, "14");
	assert.equal(first?.title, "Oct 14: $980");
	assert.equal(bars[1]?.h, 69);
	assert.equal(bars[7]?.fill, "#181818");
	assert.equal(bars[7]?.label, "21");
});

test("the first on rule that is not Auto supplies the limit key and the policy version", () => {
	const rules: Rule[] = [
		{ id: "r1", when: "a refund", agent: "support", action: "refund", approval: "Auto under limit", on: true },
		{ id: "r2", when: "an order", agent: "orders", action: "track", approval: "Auto", on: true },
		{ id: "off", when: "a refund", agent: "support", action: "other", approval: "Ask first", on: false },
	];
	assert.equal(matchedRule(rules, "support")?.id, "r1");
	assert.equal(matchedRule(rules, "orders"), null);
	assert.equal(limitKeyFor({ agent: "support" }), "policy.refund_auto_limit");
	assert.equal(limitKeyFor({ agent: "marketing" }), "policy.daily_ad_cap");
	assert.equal(limitKeyFor({ agent: "inventory" }), "policy.reorder_limit");
	assert.equal(limitKeyFor({ agent: "orders" }), null);
	const version = policyVersion(rules);
	assert.equal(version, policyVersion(rules));
	assert.match(version, /^policy-[0-9a-f]{8}$/);
	assert.notEqual(version, policyVersion(rules.slice(0, 1)));
});

for (const firstDecision of [true, false]) {
	for (const secondDecision of [true, false]) {
		test(`spend ${firstDecision ? "approve" : "decline"} ignores a second ${secondDecision ? "approve" : "decline"}`, () => {
			const first = decideApproval(agent, approval, firstDecision);
			const second = decideApproval(first.agent, first.approval, secondDecision);
			assert.equal(second.agent, first.agent);
			assert.equal(second.approval, first.approval);
		});

		test(`mission ${firstDecision ? "approve" : "decline"} ignores a second ${secondDecision ? "approve" : "decline"}`, () => {
			const first = decideMission(agent, proposal, firstDecision);
			const second = decideMission(first.agent, first.proposal, secondDecision);
			assert.equal(second.agent, first.agent);
			assert.equal(second.proposal, first.proposal);
		});
	}
}
