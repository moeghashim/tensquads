import { createFileRoute, Outlet } from "@tanstack/react-router";

import { loadWorkspaceFrame } from "#/server/workspace.ts";
import { captureWrites } from "#/workspace/approval-count.ts";
import { frameEpoch, loadHeldFrame } from "#/workspace/frame-load.ts";
import { WorkspaceProvider } from "#/workspace/provider.tsx";
import { WorkspaceShell } from "#/workspace/shell.tsx";

export const Route = createFileRoute("/_workspace")({
	shouldReload: true,
	loader: {
		staleReloadMode: "blocking",
		handler: async () => {
			const writeAt = captureWrites();
			const epoch = frameEpoch();
			return loadHeldFrame(epoch, writeAt, () => loadWorkspaceFrame());
		},
	},
	component: WorkspaceLayout,
});

function WorkspaceLayout() {
	const frame = Route.useLoaderData();
	return (
		<WorkspaceProvider frame={frame}>
			<WorkspaceShell>
				<Outlet />
			</WorkspaceShell>
		</WorkspaceProvider>
	);
}
