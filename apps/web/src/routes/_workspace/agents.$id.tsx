import { createFileRoute } from "@tanstack/react-router";

import { captureWrites } from "#/workspace/approval-count.ts";

export const Route = createFileRoute("/_workspace/agents/$id")({
	loader: () => ({ writeAt: captureWrites() }),
	head: () => ({
		meta: [{ title: "Agent dashboard" }],
	}),
	component: AgentPage,
});

function AgentPage() {
	return null;
}
