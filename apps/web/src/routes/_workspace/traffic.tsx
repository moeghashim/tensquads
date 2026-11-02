import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/traffic")({
	head: () => ({
		meta: [{ title: "Agent traffic" }],
	}),
	component: TrafficPage,
});

function TrafficPage() {
	return null;
}
