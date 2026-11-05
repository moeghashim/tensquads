import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

import { authorizedParties } from "#/server/authorized-parties.ts";
import { beginDocumentExit } from "#/workspace/session-exit-target.ts";

const csrf = createCsrfMiddleware({
	filter: (ctx) => ctx.handlerType === "serverFn",
});

const sessionRefresh = createMiddleware({ type: "function" }).client(async ({ next, method }) => {
	const refresh = await loadSessionRefresh();
	const requestId = refresh.beginSessionRead();
	try {
		const result = await next();
		refresh.resolvedSessionRead(requestId);
		return result;
	} catch (error) {
		await refresh.finishSessionRead(error, method, requestId);
		// Navigation is synchronous. Cleanup must not wait on a module download.
		if (beginDocumentExit(error)) {
			void loadExitCleanup(error);
			return new Promise<never>(() => undefined);
		}
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

// A failed download is not stored. The document navigation has already started.
function loadExitCleanup(error: unknown): Promise<void> {
	return import("#/workspace/session-exit.ts")
		.then((exit) => {
			exit.leaveForSessionExit(error);
		})
		.catch(() => undefined);
}

export const startInstance = createStart(() => {
	const secret = process.env.CLERK_SECRET_KEY ?? "";
	const requestMiddleware = secret.length > 0 ? [csrf, clerkMiddleware({ authorizedParties })] : [csrf];
	return { requestMiddleware, functionMiddleware: [sessionRefresh] };
});
