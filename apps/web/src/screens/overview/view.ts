import { proposalTitle } from "@tensquads/domain";

import type { OverviewData, OverviewProposalView } from "./types.ts";

export type DecisionKind = "spend-approve" | "spend-decline" | "mission-approve" | "mission-revise";

export interface DecisionPatch {
	readonly key: string;
	readonly kind: DecisionKind;
	readonly id: string;
}

export function presentOverview(data: OverviewData, patches: readonly DecisionPatch[]): OverviewData {
	return patches.reduce(applyPatch, data);
}

function applyPatch(data: OverviewData, patch: DecisionPatch): OverviewData {
	if (patch.kind === "spend-approve" || patch.kind === "spend-decline") {
		return dropApproval(data, patch.id);
	}
	if (patch.kind === "mission-approve") {
		return approveMission(data, patch.id);
	}
	return reviseMission(data, patch.id);
}

function dropApproval(data: OverviewData, id: string): OverviewData {
	if (!data.approvals.some((item) => item.id === id)) {
		return data;
	}
	const approvals = data.approvals.filter((item) => item.id !== id);
	return finish(data, approvals, data.proposals, data.agents, data.count - 1);
}

function approveMission(data: OverviewData, id: string): OverviewData {
	const proposal = data.proposals.find((item) => item.id === id);
	if (!proposal) {
		return data;
	}
	const proposals = data.proposals.filter((item) => item.id !== id);
	const agents = data.agents.map((agent) =>
		agent.name === proposal.agentName ? { ...agent, mission: proposal.mission, contribution: 0 } : agent,
	);
	return finish(data, data.approvals, proposals, agents, data.count - 1);
}

function reviseMission(data: OverviewData, id: string): OverviewData {
	const proposal = data.proposals.find((item) => item.id === id);
	if (!proposal?.proposed) {
		return data;
	}
	const proposals = data.proposals.map((item) => (item.id === id ? revised(item) : item));
	return finish(data, data.approvals, proposals, data.agents, data.count - 1);
}

function revised(proposal: OverviewProposalView): OverviewProposalView {
	return {
		...proposal,
		title: proposalTitle("Revising"),
		proposed: false,
		revising: true,
	};
}

function finish(
	data: OverviewData,
	approvals: OverviewData["approvals"],
	proposals: OverviewData["proposals"],
	agents: OverviewData["agents"],
	count: number,
): OverviewData {
	const next = Math.max(0, count);
	const empty = approvals.length === 0 && proposals.length === 0;
	return { ...data, approvals, proposals, agents, count: next, empty };
}
