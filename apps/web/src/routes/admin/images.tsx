import { createFileRoute } from "@tanstack/react-router";

import { ImagesScreen } from "#/screens/admin/images.tsx";
import { loadAdminImages } from "#/server/admin.ts";

export const Route = createFileRoute("/admin/images")({
	head: () => ({
		meta: [{ title: "Agent images" }],
	}),
	loader: () => loadAdminImages(),
	component: ImagesRoute,
});

function ImagesRoute() {
	const images = Route.useLoaderData();
	return <ImagesScreen images={images} />;
}
