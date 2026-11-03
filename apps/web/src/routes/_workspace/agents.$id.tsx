import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AgentDetailPage } from "#/screens/agent-detail/AgentDetailPage.tsx";
import type { AgentDetailView } from "#/screens/agent-detail/model.ts";
import { keepFailedAgentRead, useAgentWrites } from "#/screens/agent-detail/write.ts";
import { loadAgentDetail } from "#/server/agent-detail.ts";
import { agentSession, stampAgentRead } from "#/workspace/agent-on.ts";
import { captureWrites } from "#/workspace/approval-count.ts";
import { useInspect } from "#/workspace/event-view.ts";
import { hiddenSession, staySignedOut } from "#/workspace/signed-out-reload.ts";

export const Route = createFileRoute("/_workspace/agents/$id")({
	loader: async ({ params, cause }) => {
		const writeAt = captureWrites();
		const readAt = stampAgentRead(params.id);
		const session = agentSession();
		try {
			return { view: await loadAgentDetail({ data: params.id }), readAt, session, kept: false, writeAt };
		} catch (error) {
			const view = keepFailedAgentRead(params.id, session);
			if (view) return { view, readAt, session, kept: true, writeAt };
			if (!staySignedOut(cause, error)) throw error;
			return { view: hiddenAgent(params.id), readAt, session: hiddenSession, kept: true, writeAt };
		}
	},
	head: () => ({
		meta: [{ title: "Agent dashboard" }],
	}),
	component: AgentPage,
});

function hiddenAgent(id: string): AgentDetailView {
	return {
		id,
		name: "",
		role: "",
		tint: "",
		on: false,
		switchBg: "",
		switchJustify: "",
		onStr: "false",
		statusLabel: "",
		statusStyle: "",
		vmState: "",
		missionText: "",
		missionStatus: "",
		missionStatusStyle: "",
		contribution: 0,
		contributionLabel: "",
		barColor: "",
		companyMission: "",
		masterName: "",
		askLabel: "",
		targets: [],
		noTargets: true,
		kpis: [],
		skills: [],
		autonomyOpts: [],
		host: "",
		region: "",
		size: "",
		cpu: "",
		uptime: "",
		storedCpu: "",
		storedUptime: "",
		egress: [],
		secrets: [],
		sandboxNote: "",
		skillsIntro: "",
		messagesTitle: "",
		events: [],
	};
}

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
