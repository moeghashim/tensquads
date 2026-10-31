import type { Agent } from "../squads/types.ts";
import type { Approval, MissionProposal } from "./types.ts";

// Main.dc.html:453. The empty inbox uses this sentence.
export const EMPTY_INBOX = "Nothing waiting. Your squads are working inside their limits.";

// Main.dc.html:1429 counts the approval list plus proposals whose status is Proposed.
// Persisted rows stay. Pending is the visible approval. Approved and Declined are off the list.
// Revising stays on the list and does not add to the count. Main.dc.html:1182 and :1429.
export function inboxCount(approvals: readonly Approval[], proposals: readonly MissionProposal[]): number {
	const pending = approvals.filter((item) => item.status === "Pending").length;
	const proposed = proposals.filter((item) => item.status === "Proposed").length;
	return pending + proposed;
}

// Main.dc.html:1429 noApprovals is both lists empty after the design removes decided rows.
// A Revising proposal is still in the list, so the inbox is not empty.
export function inboxIsEmpty(approvals: readonly Approval[], proposals: readonly MissionProposal[]): boolean {
	const visibleApprovals = approvals.some((item) => item.status === "Pending");
	const visibleProposals = proposals.some((item) => item.status !== "Approved");
	return !visibleApprovals && !visibleProposals;
}

// Main.dc.html:1165-1170. Approve adds one task and sets last. Decline changes no agent.
export function decideApproval<A extends Pick<Agent, "tasks" | "last">>(
	agent: A,
	approval: Approval,
	ok: boolean,
): { readonly agent: A; readonly approval: Approval } {
	if (approval.status !== "Pending") {
		return { agent, approval };
	}
	if (!ok) {
		return { agent, approval: { ...approval, status: "Declined" } };
	}
	return {
		agent: { ...agent, tasks: agent.tasks + 1, last: `${approval.title} (approved)` },
		approval: { ...approval, status: "Approved" },
	};
}

// Main.dc.html:1175-1183. Approve sets the mission and adds no task. Decline sets Revising.
export function decideMission<A extends Pick<Agent, "mission" | "targets" | "contribution" | "tasks">>(
	agent: A,
	proposal: MissionProposal,
	ok: boolean,
): { readonly agent: A; readonly proposal: MissionProposal } {
	if (proposal.status !== "Proposed") {
		return { agent, proposal };
	}
	if (!ok) {
		return { agent, proposal: { ...proposal, status: "Revising" } };
	}
	return {
		agent: {
			...agent,
			mission: proposal.mission,
			targets: proposal.targets.map(([label, goal]) => [label, "—", goal] as const),
			contribution: 0,
		},
		proposal: { ...proposal, status: "Approved" },
	};
}

// Main.dc.html:1186-1190. An existing proposal for the agent blocks a new one.
// Approved is the removed state, so it does not block. The caller supplies the id.
export function askRevise<A extends Pick<Agent, "id" | "mission" | "targets">>(
	agent: A,
	proposals: readonly MissionProposal[],
	id: string,
): { readonly proposals: readonly MissionProposal[] } {
	const blocked = proposals.some((item) => item.agent === agent.id && item.status !== "Approved");
	if (blocked) {
		return { proposals };
	}
	const created: MissionProposal = {
		id,
		agent: agent.id,
		mission: agent.mission,
		targets: agent.targets.map(([label, , goal]) => [label, goal] as const),
		status: "Revising",
	};
	return { proposals: [...proposals, created] };
}
