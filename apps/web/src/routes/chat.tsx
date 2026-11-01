import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "#/server/session.ts";

export const Route = createFileRoute("/chat")({
	loader: () => requireSession(),
	component: BlankPage,
});

function BlankPage() {
	return <main />;
}
