import { createFileRoute } from "@tanstack/react-router";

import { AgentsList } from "#/screens/agents/AgentsList.tsx";
import { loadAgentsPage } from "#/server/agents.ts";

export const Route = createFileRoute("/_workspace/agents/")({
	loader: () => loadAgentsPage(),
	head: () => ({
		meta: [{ title: "Agents" }],
	}),
	component: AgentsPage,
});

function AgentsPage() {
	const data = Route.useLoaderData();
	return <AgentsList masterName={data.masterName} agents={data.agents} />;
}
