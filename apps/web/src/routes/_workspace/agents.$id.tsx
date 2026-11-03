import { createFileRoute, isRedirect, useNavigate } from "@tanstack/react-router";

import { AgentDetailPage } from "#/screens/agent-detail/AgentDetailPage.tsx";
import type { AgentDetailView } from "#/screens/agent-detail/model.ts";
import { keepFailedAgentRead, useAgentWrites } from "#/screens/agent-detail/write.ts";
import { loadAgentDetail } from "#/server/agent-detail.ts";
import { isSessionRefreshNeeded } from "#/server/session-error.ts";
import { agentSession, stampAgentRead } from "#/workspace/agent-on.ts";
import { captureWrites } from "#/workspace/approval-count.ts";
import { useInspect } from "#/workspace/event-view.ts";

function keptAccountId(view: AgentDetailView): string | null {
	if (!("accountId" in view)) return null;
	const accountId = view.accountId;
	return typeof accountId === "string" && accountId.length > 0 ? accountId : null;
}

export const Route = createFileRoute("/_workspace/agents/$id")({
	loader: async ({ params }) => {
		const writeAt = captureWrites();
		const readAt = stampAgentRead(params.id);
		const session = agentSession();
		try {
			const detail = await loadAgentDetail({ data: params.id });
			return { view: detail, accountId: detail.accountId, readAt, session, kept: false, writeAt };
		} catch (error) {
			if (isRedirect(error) || isSessionRefreshNeeded(error)) throw error;
			const view = keepFailedAgentRead(params.id, session);
			const accountId = view ? keptAccountId(view) : null;
			if (view && accountId) return { view, accountId, readAt, session, kept: true, writeAt };
			throw error;
		}
	},
	head: () => ({
		meta: [{ title: "Agent dashboard" }],
	}),
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
