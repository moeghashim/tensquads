import { createFileRoute } from "@tanstack/react-router";

import { AccountsScreen } from "#/screens/admin/accounts.tsx";
import { loadAdminAccounts } from "#/server/admin.ts";

export const Route = createFileRoute("/admin/")({
	head: () => ({
		meta: [{ title: "All accounts" }],
	}),
	loader: () => loadAdminAccounts(),
	component: AccountsRoute,
});

function AccountsRoute() {
	const accounts = Route.useLoaderData();
	return <AccountsScreen accounts={accounts} />;
}
