import { resetTargetAccount } from "#/screens/rules/write-queue.ts";
import { retireLiveQueue } from "#/workspace/live.ts";
import { beginDocumentExit } from "#/workspace/session-exit-target.ts";

// Drops queued workspace writes. A failure here must not cancel the document navigation.
function dropPendingWorkspace(): void {
	try {
		resetTargetAccount();
		retireLiveQueue();
	} catch {
		// The browser is already leaving. Cleanup is best-effort.
	}
}

// Document navigation. The server call must not settle, or the screen treats it as a failed write.
export function leaveForSessionExit(error: unknown): boolean {
	if (!beginDocumentExit(error)) return false;
	dropPendingWorkspace();
	return true;
}
