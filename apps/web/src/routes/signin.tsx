import { createFileRoute } from "@tanstack/react-router";

import { SignInPage } from "#/screens/signin/SignInPage.tsx";
import { Route as RootRoute } from "./__root.tsx";

export const Route = createFileRoute("/signin")({
	head: () => ({
		meta: [{ title: "Sign in" }],
	}),
	component: SignInRoute,
});

function SignInRoute() {
	const publishableKey = RootRoute.useLoaderData();
	return <SignInPage publishableKey={publishableKey} />;
}
