import { createFileRoute, Outlet } from "@tanstack/react-router";

import { loadWorkspaceFrame } from "#/server/workspace.ts";
import { WorkspaceProvider } from "#/workspace/provider.tsx";
import { WorkspaceShell } from "#/workspace/shell.tsx";

export const Route = createFileRoute("/_workspace")({
	shouldReload: true,
	loader: {
		staleReloadMode: "blocking",
		handler: async () => {
			const readStartedAt = Date.now();
			return { ...(await loadWorkspaceFrame()), readStartedAt };
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
