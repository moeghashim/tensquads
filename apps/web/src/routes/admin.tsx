import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AdminShell } from "#/screens/admin/shell.tsx";
import { loadAdminAttention } from "#/server/admin.ts";

export const Route = createFileRoute("/admin")({
	loader: () => loadAdminAttention(),
	component: AdminLayout,
});

function AdminLayout() {
	const attention = Route.useLoaderData();
	return (
		<AdminShell attention={attention}>
			<Outlet />
		</AdminShell>
	);
}
