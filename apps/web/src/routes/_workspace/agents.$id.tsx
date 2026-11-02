import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AgentDetailPage } from "#/screens/agent-detail/AgentDetailPage.tsx";
import { useAgentWrites } from "#/screens/agent-detail/write.ts";
import { loadAgentDetail } from "#/server/agent-detail.ts";
import { useInspect } from "#/workspace/event-view.ts";

import { captureWrites } from "#/workspace/approval-count.ts";

export const Route = createFileRoute("/_workspace/agents/$id")({
	loader: () => ({ writeAt: captureWrites() }),
	head: () => ({
		meta: [{ title: "Agent dashboard" }],
	}),
	loader: ({ params }) => loadAgentDetail({ data: params.id }),
	component: AgentPage,
});

function AgentPage() {
	const view = Route.useLoaderData();
	const writes = useAgentWrites(view.id);
	const inspect = useInspect();
	const navigate = useNavigate();
	return (
		<AgentDetailPage
			view={view}
			onAgents={() => {
				void navigate({ to: "/agents" });
			}}
			onToggle={() => {
				writes.toggleAgent(!view.on);
			}}
			onAsk={() => {
				writes.askRevise();
			}}
			onSkill={(skillId, on) => {
				writes.toggleSkill(skillId, on);
			}}
			onAutonomy={(autonomy) => {
				writes.pickAutonomy(autonomy);
			}}
			onInspect={inspect}
		/>
	);
}
