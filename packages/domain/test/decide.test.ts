import assert from "node:assert/strict";
import test from "node:test";

import {
	type Approval,
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
	contribution: 0,
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
	assert.equal(result.agent.contribution, 0);
	assert.equal(result.agent.mission, proposal.mission);
	assert.deepEqual(result.agent.targets, [
		["Stock-outs", "—", "0"],
		["Days of stock", "—", "under 30"],
	]);
	assert.equal(result.proposal.status, "Approved");
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
