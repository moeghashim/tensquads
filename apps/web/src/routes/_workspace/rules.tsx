import { createFileRoute } from "@tanstack/react-router";

import { RulesScreen } from "#/screens/rules/screen.tsx";
import { rulesWriteCounter } from "#/screens/rules/snapshot.ts";
import { loadRulesPage } from "#/server/rules.ts";

export const Route = createFileRoute("/_workspace/rules")({
	loader: async () => {
		const readCounter = rulesWriteCounter();
		const page = await loadRulesPage();
		return { ...page, readCounter };
	},
	head: () => ({
		meta: [{ title: "Rules and limits" }],
	}),
	component: RulesPage,
});

function RulesPage() {
	const page = Route.useLoaderData();
	return <RulesScreen page={page} />;
}
