import { ClerkProvider, useUser } from "@clerk/tanstack-react-start";
import { createRootRoute, HeadContent, Outlet, Scripts, useRouter } from "@tanstack/react-router";
import { SQUADMATE_CSS } from "@tensquads/squadmates";
import { type ReactNode, useRef } from "react";

// The package constant wraps the rules. The head owns that element once, so button text stays the words.
const squadmateRules = SQUADMATE_CSS.replace(/^<style>\n?/, "").replace(/\n?<\/style>$/, "");

import "#/design/public.css";
import { watchSignedInUser } from "#/screens/rules/write-queue.ts";
import { getPublishableKey } from "#/server/publishable-key.ts";
import { agentSession, resetAgentClientState } from "#/workspace/agent-on.ts";
import { clerkAccountReset } from "#/workspace/clerk-account-switch.ts";

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
	const decision = clerkAccountReset(previous.current, next, agentSession());
	previous.current = decision.previous;
	if (decision.reset) {
		queueMicrotask(() => {
			resetAgentClientState();
			// Sign-out reloads the workspace, and that loader redirects to /signin.
			// A switch reloads the signed-in account instead of leaving the old page blank.
			void router.invalidate({ sync: true });
		});
	}
	return children;
}

function RootDocument({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
				<style>{squadmateRules}</style>
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
