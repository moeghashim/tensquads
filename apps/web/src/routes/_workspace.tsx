import { createFileRoute, Outlet } from "@tanstack/react-router";

import { loadWorkspaceFrame } from "#/server/workspace.ts";
import { WorkspaceProvider } from "#/workspace/provider.tsx";
import { WorkspaceShell } from "#/workspace/shell.tsx";

export const Route = createFileRoute("/_workspace")({
	loader: () => loadWorkspaceFrame(),
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
