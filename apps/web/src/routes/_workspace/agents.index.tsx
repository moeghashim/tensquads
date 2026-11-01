import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/agents/")({
	head: () => ({
		meta: [{ title: "Agents" }],
	}),
	component: AgentsPage,
});

function AgentsPage() {
	return null;
}
