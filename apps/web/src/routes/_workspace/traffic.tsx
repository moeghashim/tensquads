import { createFileRoute } from "@tanstack/react-router";

import { TrafficPage } from "#/screens/traffic/page.tsx";
import { advanceTraffic, loadTraffic } from "#/server/traffic.ts";
import { captureWrites } from "#/workspace/approval-count.ts";
import { registerTrafficAdvance } from "#/workspace/live.ts";

registerTrafficAdvance((options) => advanceTraffic(options));

export const Route = createFileRoute("/_workspace/traffic")({
	head: () => ({
		meta: [{ title: "Agent traffic" }],
	}),
	loader: async () => {
		const writeAt = captureWrites();
		return { ...(await loadTraffic()), writeAt };
	},
	component: TrafficRoute,
});

function TrafficRoute() {
	const data = Route.useLoaderData();
	return <TrafficPage data={data} />;
}
