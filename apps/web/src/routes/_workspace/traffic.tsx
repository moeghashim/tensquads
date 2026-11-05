import { createFileRoute } from "@tanstack/react-router";

import { TrafficPage } from "#/screens/traffic/page.tsx";
import { publishTrafficEvent, trafficAccountGeneration } from "#/screens/traffic/published.ts";
import { advanceTraffic, loadTraffic } from "#/server/traffic.ts";
import { captureWrites } from "#/workspace/approval-count.ts";
import { registerTrafficAdvance } from "#/workspace/live.ts";

registerTrafficAdvance(async (options) => {
	const generation = trafficAccountGeneration();
	const event = await advanceTraffic(options);
	if (!event || event.id.length === 0) return "";
	// The account may have changed while this write was in flight.
	if (!publishTrafficEvent(options.data, event, generation)) return "";
	return event.id;
});

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
