import { createServerFn } from "@tanstack/react-start";

import { workerEnv } from "./worker-env.ts";

export const getPublishableKey = createServerFn({ method: "GET" }).handler(async () => {
	const fromVite = await workerEnv("VITE_CLERK_PUBLISHABLE_KEY");
	if (fromVite.length > 0) {
		return fromVite;
	}
	return workerEnv("CLERK_PUBLISHABLE_KEY");
});
