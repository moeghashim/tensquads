import { resetTargetAccount } from "#/screens/rules/write-queue.ts";
import { retireLiveQueue } from "#/workspace/live.ts";
import { sessionExitTarget, workspacePage } from "#/workspace/session-exit-target.ts";

// The frame read and the screen read can both redirect. One navigation is enough.
let navigationStarted = false;

// Document navigation. The server call must not settle, or the screen treats it as a failed write.
export function leaveForSessionExit(error: unknown): boolean {
	const target = sessionExitTarget(error);
	if (target === null || typeof window === "undefined") return false;
	if (!workspacePage(window.location.pathname)) return false;
	if (navigationStarted) return true;
	if (window.location.pathname === target) return false;
	navigationStarted = true;
	resetTargetAccount();
	retireLiveQueue();
	window.location.assign(target);
	return true;
}
