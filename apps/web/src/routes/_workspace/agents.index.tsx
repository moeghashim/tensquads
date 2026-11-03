import { createFileRoute } from "@tanstack/react-router";

import { AgentsList } from "#/screens/agents/AgentsList.tsx";
import { loadAgentsPage } from "#/server/agents.ts";
import { captureWrites } from "#/workspace/approval-count.ts";

export const Route = createFileRoute("/_workspace/agents/")({
	loader: async () => {
		const writeAt = captureWrites();
		return { ...(await loadAgentsPage()), writeAt };
	},
	head: () => ({
		meta: [{ title: "Agents" }],
	}),
	component: AgentsPage,
});

function AgentsPage() {
	const data = Route.useLoaderData();
	return <AgentsList masterName={data.masterName} agents={data.agents} />;
}
