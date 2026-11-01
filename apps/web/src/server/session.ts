import { redirect } from "@tanstack/react-router";

import { workerEnv } from "./worker-env.ts";

export async function requireClerkUser(): Promise<string> {
	const secret = await workerEnv("CLERK_SECRET_KEY");
	if (secret.length === 0) {
		throw redirect({ to: "/signin" });
	}
	const { auth } = await import("@clerk/tanstack-react-start/server");
	const session = await auth();
	if (!session.userId) {
		throw redirect({ to: "/signin" });
	}
	return session.userId;
}
