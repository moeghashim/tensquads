import { createServerFn } from "@tanstack/react-start";

import type { AgentCardData, AgentsPageData } from "#/screens/agents/types.ts";

export const loadAgentsPage = createServerFn({ method: "GET" }).handler(async (): Promise<AgentsPageData> => {
	const { requireWorkspace } = await import("./workspace-session.ts");
	return requireWorkspace(async (scope, db) => {
		const { createRepositories } = await import("@tensquads/adapters");
		const squads = createRepositories(db).squads;
		const master = await squads.master(scope);
		const agents = await squads.listAgents(scope);
		return {
			masterName: master?.name ?? "Master",
			agents: agents.map(toCard),
		};
	});
});

function toCard(agent: Awaited<ReturnType<AgentSource["listAgents"]>>[number]): AgentCardData {
	return {
		id: agent.id,
		name: agent.name,
		role: agent.role,
		tint: agent.tint,
		on: agent.on,
		autonomy: agent.autonomy,
		mission: agent.mission,
		contribution: agent.contribution,
		tasks: agent.tasks,
		success: agent.success,
		host: agent.host,
		region: agent.region,
		skills: agent.skills.map((skill) => ({ id: skill.id, on: skill.on })),
	};
}

type AgentSource = {
	listAgents: (scope: { readonly accountId: string; readonly mode: "account" }) => Promise<
		readonly {
			readonly id: string;
			readonly name: string;
			readonly role: string;
			readonly tint: string;
			readonly on: boolean;
			readonly autonomy: string;
			readonly mission: string;
			readonly contribution: number;
			readonly tasks: number;
			readonly success: string;
			readonly host: string;
			readonly region: string;
			readonly skills: readonly { readonly id: string; readonly on: boolean }[];
		}[]
	>;
};
