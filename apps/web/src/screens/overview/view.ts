import { EMPTY_INBOX, proposalTitle, TASKS_DONE_LABEL } from "@tensquads/domain";

import type { OverviewApprovalView, OverviewData, OverviewProposalView } from "./types.ts";

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
		return dropApproval(data, patch.id, patch.kind === "spend-approve");
	}
	if (patch.kind === "mission-approve") {
		return approveMission(data, patch.id);
	}
	return reviseMission(data, patch.id);
}

function dropApproval(data: OverviewData, id: string, countTask: boolean): OverviewData {
	const approval = data.approvals.find((item) => item.id === id);
	if (!approval) {
		return data;
	}
	const approvals = data.approvals.filter((item) => item.id !== id);
	const agents = countTask ? noteApproved(data.agents, approval) : data.agents;
	const tiles = countTask ? noteTasksTile(data.tiles) : data.tiles;
	return finish({ ...data, tiles }, approvals, data.proposals, agents, data.count - 1);
}

function noteApproved(agents: OverviewData["agents"], approval: OverviewApprovalView): OverviewData["agents"] {
	return agents.map((agent) =>
		agent.name === approval.agentName
			? { ...agent, tasks: agent.tasks + 1, last: `${approval.title} (approved)` }
			: agent,
	);
}

function noteTasksTile(tiles: OverviewData["tiles"]): OverviewData["tiles"] {
	return tiles.map((tile) => {
		if (tile.label !== TASKS_DONE_LABEL) {
			return tile;
		}
		const value = Number(tile.value);
		if (!Number.isFinite(value)) {
			return tile;
		}
		return { ...tile, value: String(value + 1) };
	});
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
	return {
		...data,
		approvals,
		proposals,
		agents,
		count: next,
		empty,
		emptyText: empty ? EMPTY_INBOX : "",
	};
}
