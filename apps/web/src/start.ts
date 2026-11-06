import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

import { partiesForBuild } from "#/server/authorized-parties.ts";
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

// A development document may reach Clerk before clerk-js writes the suffixed dev-browser cookie.
// Load the checker here. A top-level import puts Clerk's backend in the browser bundle.
const devBrowserDocument = createMiddleware().server(async ({ request, next }) => {
	const { clerkPublishableKey, documentRequestForClerk } = await import("#/server/dev-browser-document.ts");
	const carried = await documentRequestForClerk(request, await clerkPublishableKey());
	if (carried === request) return next();
	// TanStack copies request onto the middleware context at runtime.
	return next({ request: carried } as Parameters<typeof next>[0]);
});

export const startInstance = createStart(() => {
	const secret = process.env.CLERK_SECRET_KEY ?? "";
	const requestMiddleware =
		secret.length > 0
			? [csrf, devBrowserDocument, clerkMiddleware({ authorizedParties: [...partiesForBuild()] })]
			: [csrf];
	return { requestMiddleware, functionMiddleware: [sessionRefresh] };
});
