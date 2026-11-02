import { createFileRoute } from "@tanstack/react-router";

import { OverviewPage } from "#/screens/overview/page.tsx";
import { loadOverview } from "#/server/overview.ts";

export const Route = createFileRoute("/_workspace/overview")({
	head: () => ({
		meta: [{ title: "tensquads workspace" }],
	}),
	loader: () => loadOverview(),
	component: OverviewRoute,
});

function OverviewRoute() {
	const data = Route.useLoaderData();
	return <OverviewPage data={data} />;
}
