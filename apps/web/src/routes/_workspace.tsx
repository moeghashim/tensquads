import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";

import { loadWorkspaceFrame } from "#/server/workspace.ts";
import { agentSession, stampAgentReads, subscribeAgentSession } from "#/workspace/agent-on.ts";
import { captureWrites } from "#/workspace/approval-count.ts";
import { frameEpoch, loadHeldFrame } from "#/workspace/frame-load.ts";
import { WorkspaceProvider } from "#/workspace/provider.tsx";
import { WorkspaceShell } from "#/workspace/shell.tsx";
import { hiddenFrame, hiddenSession, staySignedOut } from "#/workspace/signed-out-reload.ts";

export const Route = createFileRoute("/_workspace")({
	shouldReload: true,
	loader: {
		staleReloadMode: "blocking",
		handler: async ({ cause }) => {
			const readAt = stampAgentReads();
			const session = agentSession();
			const writeAt = captureWrites();
			const epoch = frameEpoch();
			try {
				const frame = await loadHeldFrame(epoch, writeAt, () => loadWorkspaceFrame());
				return { frame, readAt, session, writeAt: frame.writeAt, approvalCount: frame.approvalCount };
			} catch (error) {
				// The page is already here. A signed-out stay must not navigate to /signin or keep the previous account.
				if (!staySignedOut(cause, error)) throw error;
				const frame = hiddenFrame(writeAt);
				return {
					frame,
					readAt,
					session: hiddenSession,
					writeAt: frame.writeAt,
					approvalCount: frame.approvalCount,
				};
			}
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
