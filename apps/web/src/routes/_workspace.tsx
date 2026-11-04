import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";

import { loadWorkspaceFrame } from "#/server/workspace.ts";
import { agentSession, stampAgentReads, subscribeAgentSession } from "#/workspace/agent-on.ts";
import { captureWrites } from "#/workspace/approval-count.ts";
import { frameEpoch, loadHeldFrame } from "#/workspace/frame-load.ts";
import { WorkspaceProvider } from "#/workspace/provider.tsx";
import { WorkspaceShell } from "#/workspace/shell.tsx";

export const Route = createFileRoute("/_workspace")({
	shouldReload: true,
	loader: {
		staleReloadMode: "blocking",
		handler: async () => {
			const readAt = stampAgentReads();
			const session = agentSession();
			const writeAt = captureWrites();
			const epoch = frameEpoch();
			const frame = await loadHeldFrame(epoch, writeAt, () => loadWorkspaceFrame());
			return { frame, readAt, session, writeAt: frame.writeAt, approvalCount: frame.approvalCount };
		},
	},
	component: WorkspaceLayout,
});

function WorkspaceLayout() {
	const { frame, readAt, session } = Route.useLoaderData();
	const currentSession = useSyncExternalStore(subscribeAgentSession, agentSession, agentSession);
	if (session !== currentSession) return null;
	return (
		<WorkspaceProvider key={session} frame={frame} readAt={readAt}>
			<WorkspaceShell>
				<Outlet />
			</WorkspaceShell>
		</WorkspaceProvider>
	);
}
