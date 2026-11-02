import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AgentDetailPage } from "#/screens/agent-detail/AgentDetailPage.tsx";
import type { AgentDetailView } from "#/screens/agent-detail/model.ts";
import { stampAgentRead, useAgentWrites } from "#/screens/agent-detail/write.ts";
import { loadAgentDetail } from "#/server/agent-detail.ts";
import { useInspect } from "#/workspace/event-view.ts";

import { captureWrites } from "#/workspace/approval-count.ts";

export const Route = createFileRoute("/_workspace/agents/$id")({
	loader: () => ({ writeAt: captureWrites() }),
	head: () => ({
		meta: [{ title: "Agent dashboard" }],
	}),
	loader: async ({ params }) => {
		const readAt = stampAgentRead(params.id);
		return { view: await loadAgentDetail({ data: params.id }), readAt };
	},
	component: AgentPage,
});

function AgentPage() {
	const { view, readAt } = Route.useLoaderData();
	return <AgentControls key={view.id} view={view} readAt={readAt} />;
}

function AgentControls({ view, readAt }: { readonly view: AgentDetailView; readonly readAt: number }) {
	const writes = useAgentWrites(view, readAt);
	const inspect = useInspect();
	const navigate = useNavigate();
	return (
		<AgentDetailPage
			view={writes.view}
			onAgents={() => {
				void navigate({ to: "/agents" });
			}}
			onToggle={() => {
				writes.toggleAgent(!writes.view.on);
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
