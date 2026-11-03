import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AgentDetailPage } from "#/screens/agent-detail/AgentDetailPage.tsx";
import type { AgentDetailView } from "#/screens/agent-detail/model.ts";
import { keepFailedAgentRead, useAgentWrites } from "#/screens/agent-detail/write.ts";
import { loadAgentDetail } from "#/server/agent-detail.ts";
import { agentSession, stampAgentRead } from "#/workspace/agent-on.ts";
import { useInspect } from "#/workspace/event-view.ts";

import { captureWrites } from "#/workspace/approval-count.ts";

export const Route = createFileRoute("/_workspace/agents/$id")({
	loader: () => ({ writeAt: captureWrites() }),
	head: () => ({
		meta: [{ title: "Agent dashboard" }],
	}),
	loader: async ({ params }) => {
		const readAt = stampAgentRead(params.id);
		const session = agentSession();
		try {
			return { view: await loadAgentDetail({ data: params.id }), readAt, session, kept: false };
		} catch (error) {
			const view = keepFailedAgentRead(params.id, session);
			if (!view) throw error;
			return { view, readAt, session, kept: true };
		}
	},
	component: AgentPage,
});

function AgentPage() {
	const { view, readAt, session, kept } = Route.useLoaderData();
	return <AgentControls key={`${session}:${view.id}`} view={view} readAt={readAt} session={session} kept={kept} />;
}

function AgentControls({
	view,
	readAt,
	session,
	kept,
}: {
	readonly view: AgentDetailView;
	readonly readAt: number;
	readonly session: number;
	readonly kept: boolean;
}) {
	const writes = useAgentWrites(view, readAt, session, kept);
	const inspect = useInspect();
	const navigate = useNavigate();
	if (!writes) return null;
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
