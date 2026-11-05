import type { AppDatabase } from "@tensquads/adapters";
import { readOverviewSnapshot } from "@tensquads/adapters";
import type { AccountScope, Agent } from "@tensquads/domain";
import {
	assembleTiles,
	blankText,
	chipText,
	greetingLine,
	onlineLine,
	proposalTitle,
	revenueBars,
} from "@tensquads/domain";

import type { OverviewData } from "#/screens/overview/types.ts";

// One loader request. The reads stay in order because PGlite serves one query at a time.
export async function readOverview(db: AppDatabase, scope: AccountScope): Promise<OverviewData> {
	const { accounts, agents, tasksDone, master, stored, revenue, inbox } = await readOverviewSnapshot(db, scope);
	const account = accounts.find((item) => item.id === scope.accountId);
	if (!account) {
		throw new Error("The account is missing.");
	}
	if (!master) {
		throw new Error("The account has no master.");
	}
	const byId = new Map(agents.map((agent) => [agent.id, agent]));
	const tiles = assembleTiles({
		stored,
		tasksDone,
		revenue: revenue.map((day) => day.amount),
		saved: agents.map((agent) => agent.saved),
	});
	return {
		accountId: scope.accountId,
		greeting: greetingLine(account.owner),
		mission: blankText(account.mission),
		online: onlineLine(agents.filter((agent) => agent.on).length, agents.length),
		tiles,
		bars: revenueBars(revenue),
		count: inbox.count,
		empty: inbox.empty,
		emptyText: inbox.emptyText,
		proposals: inbox.proposals.map((proposal) => {
			const agent = named(byId, proposal.agent);
			return {
				id: proposal.id,
				agentId: agent.id,
				agentName: agent.name,
				tint: agent.tint,
				title: proposalTitle(proposal.status),
				mission: proposal.mission,
				chips: proposal.targets.map(([label, goal]) => chipText(label, goal)),
				proposed: proposal.status === "Proposed",
				revising: proposal.status === "Revising",
			};
		}),
		approvals: inbox.approvals.map((approval) => {
			const agent = named(byId, approval.agent);
			return {
				id: approval.id,
				agentId: agent.id,
				agentName: agent.name,
				tint: agent.tint,
				amount: approval.amount,
				title: approval.title,
				detail: approval.detail,
			};
		}),
		agents: agents.map(agentView),
		masterName: master.name,
	};
}

function named(byId: ReadonlyMap<string, Agent>, id: string): Agent {
	const agent = byId.get(id);
	if (!agent) {
		throw new Error("The inbox names an agent.");
	}
	return agent;
}

function agentView(agent: Agent) {
	return {
		id: agent.id,
		name: agent.name,
		role: agent.role,
		tint: agent.tint,
		on: agent.on,
		last: agent.last,
		tasks: agent.tasks,
		success: agent.success,
		saved: agent.saved,
		mission: agent.mission,
		contribution: agent.contribution,
	};
}
