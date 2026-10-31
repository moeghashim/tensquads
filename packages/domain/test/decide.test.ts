import assert from "node:assert/strict";
import test from "node:test";

import {
	type Approval,
	askRevise,
	decideApproval,
	decideMission,
	EMPTY_INBOX,
	inboxCount,
	inboxIsEmpty,
	type MissionProposal,
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
