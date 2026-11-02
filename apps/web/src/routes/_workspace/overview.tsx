import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/overview")({
	head: () => ({
		meta: [{ title: "tensquads workspace" }],
	}),
	component: OverviewPage,
});

function OverviewPage() {
	return null;
}
