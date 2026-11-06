import { createFileRoute } from "@tanstack/react-router";

import { HomePage } from "#/screens/home/HomePage.tsx";
import { HomeV2Page } from "#/screens/home-v2/HomeV2Page.tsx";
import { getHomeV2 } from "#/server/home-host.ts";

export const Route = createFileRoute("/")({
	loader: () => getHomeV2(),
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData ? "tensquads · A team that checks its work" : "tensquads homepage",
			},
		],
	}),
	component: RootHome,
});

function RootHome() {
	const isV2 = Route.useLoaderData();
	if (isV2) {
		return <HomeV2Page />;
	}
	return <HomePage />;
}
