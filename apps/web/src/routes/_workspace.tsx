import { createFileRoute, Outlet } from "@tanstack/react-router";

import { loadWorkspaceFrame } from "#/server/workspace.ts";
import { stampAgentReads } from "#/workspace/agent-on.ts";
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
			const writeAt = captureWrites();
			const epoch = frameEpoch();
			const frame = await loadHeldFrame(epoch, writeAt, () => loadWorkspaceFrame());
			return { frame, readAt, writeAt: frame.writeAt, approvalCount: frame.approvalCount };
		},
	},
	component: WorkspaceLayout,
});

function WorkspaceLayout() {
	const { frame, readAt } = Route.useLoaderData();
	return (
		<WorkspaceProvider frame={frame} readAt={readAt}>
			<WorkspaceShell>
				<Outlet />
			</WorkspaceShell>
		</WorkspaceProvider>
	);
}
