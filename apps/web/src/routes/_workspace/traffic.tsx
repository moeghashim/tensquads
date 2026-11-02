import { createFileRoute } from "@tanstack/react-router";

import { TrafficPage } from "#/screens/traffic/page.tsx";
import { loadTraffic } from "#/server/traffic.ts";

export const Route = createFileRoute("/_workspace/traffic")({
	head: () => ({
		meta: [{ title: "Agent traffic" }],
	}),
	loader: () => loadTraffic(),
	component: TrafficRoute,
});

function TrafficRoute() {
	const data = Route.useLoaderData();
	return <TrafficPage data={data} />;
}
