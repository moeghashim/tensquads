import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/rules")({
	head: () => ({
		meta: [{ title: "Rules and limits" }],
	}),
	component: RulesPage,
});

function RulesPage() {
	return null;
}
