import { createFileRoute } from "@tanstack/react-router";

import { HomePage } from "#/screens/home/HomePage.tsx";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [{ title: "tensquads homepage" }],
	}),
	component: HomePage,
});
