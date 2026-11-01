import { ClerkProvider } from "@clerk/tanstack-react-start";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";

import "#/design/public.css";
import { getPublishableKey } from "#/server/publishable-key.ts";

export const Route = createRootRoute({
	loader: () => getPublishableKey(),
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "tensquads" },
		],
		links: [
			{ rel: "preconnect", href: "https://fonts.googleapis.com" },
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
			},
		],
	}),
	component: RootApp,
	shellComponent: RootDocument,
});

function RootApp() {
	const publishableKey = Route.useLoaderData();
	if (publishableKey.length === 0) {
		return <Outlet />;
	}
	return (
		<ClerkProvider publishableKey={publishableKey}>
			<Outlet />
		</ClerkProvider>
	);
}

function RootDocument({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
