import { createFileRoute } from "@tanstack/react-router";

import { loadHeldOverview, overviewEpoch } from "#/screens/overview/load.ts";
import { OverviewPage } from "#/screens/overview/page.tsx";
import { loadOverview } from "#/server/overview.ts";
import { captureWrites } from "#/workspace/approval-count.ts";

export const Route = createFileRoute("/_workspace/overview")({
	head: () => ({
		meta: [{ title: "tensquads workspace" }],
	}),
	loader: async () => {
		const writeAt = captureWrites();
		const epoch = overviewEpoch();
		return loadHeldOverview(epoch, writeAt, () => loadOverview());
	},
	component: OverviewRoute,
});

function OverviewRoute() {
	const data = Route.useLoaderData();
	return <OverviewPage data={data} />;
}
