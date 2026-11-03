import { createFileRoute } from "@tanstack/react-router";

import { loadRulesSnapshot } from "#/screens/rules/loader.ts";
import { RulesScreen } from "#/screens/rules/screen.tsx";
import { captureWrites } from "#/workspace/approval-count.ts";

export const Route = createFileRoute("/_workspace/rules")({
	loader: async () => {
		const writeAt = captureWrites();
		const page = await loadRulesSnapshot();
		return { ...page, writeAt };
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
