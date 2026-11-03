import { ClerkProvider, useUser } from "@clerk/tanstack-react-start";
import { createRootRoute, HeadContent, Outlet, Scripts, useRouter } from "@tanstack/react-router";
import { type ReactNode, useRef } from "react";

import "#/design/public.css";
import { watchSignedInUser } from "#/screens/rules/write-queue.ts";
import { getPublishableKey } from "#/server/publishable-key.ts";
import { resetAgentClientState } from "#/workspace/agent-on.ts";

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
			<ClerkAccountReset>
				<SignedInAccount />
				<Outlet />
			</ClerkAccountReset>
		</ClerkProvider>
	);
}

function SignedInAccount() {
	const { isLoaded, user } = useUser();
	if (isLoaded) watchSignedInUser(user?.id ?? null);
	return null;
}

function ClerkAccountReset({ children }: { readonly children: ReactNode }) {
	const { isLoaded, user } = useUser();
	const router = useRouter();
	const next = isLoaded ? (user?.id ?? null) : undefined;
	const previous = useRef(next);
	if (next !== undefined && previous.current !== next) {
		const wasLoaded = previous.current !== undefined;
		previous.current = next;
		if (wasLoaded) {
			queueMicrotask(() => {
				resetAgentClientState();
				if (next !== null) void router.invalidate({ sync: true });
			});
		}
	}
	return children;
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
