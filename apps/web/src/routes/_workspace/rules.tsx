import { createFileRoute } from "@tanstack/react-router";

import { RulesScreen } from "#/screens/rules/screen.tsx";
import { loadRulesPage } from "#/server/rules.ts";

export const Route = createFileRoute("/_workspace/rules")({
	loader: () => loadRulesPage(),
	head: () => ({
		meta: [{ title: "Rules and limits" }],
	}),
	component: RulesPage,
});

function RulesPage() {
	const page = Route.useLoaderData();
	return <RulesScreen page={page} />;
}
