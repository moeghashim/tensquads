import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

import { authorizedParties } from "#/server/authorized-parties.ts";
import { sessionExitTarget, workspacePage } from "#/workspace/session-exit-target.ts";

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
		// A workspace redirect leaves at once. Any other error must throw without waiting.
		if (leavesWorkspace(error) && (await leaveExpiredSession(error))) return new Promise<never>(() => undefined);
		throw error;
	} finally {
		refresh.endSessionRead(requestId);
	}
});

let sessionRefreshModule: Promise<typeof import("#/session/refresh.ts")> | undefined;
let sessionExitModule: Promise<typeof import("#/workspace/session-exit.ts")> | undefined;

function loadSessionRefresh() {
	sessionRefreshModule ??= import("#/session/refresh.ts");
	return sessionRefreshModule;
}

function loadSessionExit() {
	sessionExitModule ??= import("#/workspace/session-exit.ts");
	return sessionExitModule;
}

function leavesWorkspace(error: unknown): boolean {
	if (sessionExitTarget(error) === null || typeof window === "undefined") return false;
	return workspacePage(window.location.pathname);
}

async function leaveExpiredSession(error: unknown): Promise<boolean> {
	const exit = await loadSessionExit();
	return exit.leaveForSessionExit(error);
}

export const startInstance = createStart(() => {
	const secret = process.env.CLERK_SECRET_KEY ?? "";
	const requestMiddleware = secret.length > 0 ? [csrf, clerkMiddleware({ authorizedParties })] : [csrf];
	return { requestMiddleware, functionMiddleware: [sessionRefresh] };
});
