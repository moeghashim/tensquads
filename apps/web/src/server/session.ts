import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { workerEnv } from "./worker-env.ts";

export const requireSession = createServerFn({ method: "GET" }).handler(async () => {
	const secret = await workerEnv("CLERK_SECRET_KEY");
	if (secret.length === 0) {
		throw redirect({ to: "/signin" });
	}
	const { auth } = await import("@clerk/tanstack-react-start/server");
	const session = await auth();
	if (!session.userId) {
		throw redirect({ to: "/signin" });
	}
	return { userId: session.userId };
});
