import { createFileRoute } from "@tanstack/react-router";

import { loadRulesSnapshot } from "#/screens/rules/loader.ts";
import { RulesScreen } from "#/screens/rules/screen.tsx";

export const Route = createFileRoute("/_workspace/rules")({
	loader: loadRulesSnapshot,
	head: () => ({
		meta: [{ title: "Rules and limits" }],
	}),
	component: RulesPage,
});

function RulesPage() {
	const page = Route.useLoaderData();
	return <RulesScreen page={page} />;
}
