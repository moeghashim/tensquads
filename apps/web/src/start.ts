import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

import { authorizedParties } from "#/server/authorized-parties.ts";

const csrf = createCsrfMiddleware({
	filter: (ctx) => ctx.handlerType === "serverFn",
});

const sessionRefresh = createMiddleware({ type: "function" }).client(async ({ next, method }) => {
	const refresh = await loadSessionRefresh();
	const requestId = refresh.beginSessionRead();
	try {
		return await next();
	} catch (error) {
		await refresh.finishSessionRead(error, method, requestId);
		throw error;
	} finally {
		refresh.endSessionRead(requestId);
	}
});

let sessionRefreshModule: Promise<typeof import("#/session/refresh.ts")> | undefined;

function loadSessionRefresh() {
	sessionRefreshModule ??= import("#/session/refresh.ts");
	return sessionRefreshModule;
}

export const startInstance = createStart(() => {
	const secret = process.env.CLERK_SECRET_KEY ?? "";
	const requestMiddleware = secret.length > 0 ? [csrf, clerkMiddleware({ authorizedParties })] : [csrf];
	return { requestMiddleware, functionMiddleware: [sessionRefresh] };
});
