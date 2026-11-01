import { createFileRoute } from "@tanstack/react-router";

import { SignupPage } from "#/screens/signup/SignupPage.tsx";
import { Route as RootRoute } from "./__root.tsx";

export const Route = createFileRoute("/signup")({
	head: () => ({
		meta: [{ title: "Create your business" }],
	}),
	component: SignupRoute,
});

function SignupRoute() {
	const publishableKey = RootRoute.useLoaderData();
	return <SignupPage publishableKey={publishableKey} />;
}
