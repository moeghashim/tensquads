import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/agents/$id")({
	head: () => ({
		meta: [{ title: "Agent dashboard" }],
	}),
	component: AgentPage,
});

function AgentPage() {
	return null;
}
