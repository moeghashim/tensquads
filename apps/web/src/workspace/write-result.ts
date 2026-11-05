import { isSessionRefreshNeeded } from "#/server/session-error.ts";

import { sessionExitTarget } from "./session-exit-target.ts";

export type SettledWrite<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly left: boolean; readonly refreshNeeded: boolean };

// A redirect to admin or sign-in is not a failed write. A session that needs a
// refresh is a failed write: the screen shows its stored value and does not replay it.
export async function settleWrite<T>(run: () => Promise<T>): Promise<SettledWrite<T>> {
	try {
		return { ok: true, value: await run() };
	} catch (error) {
		const left = sessionExitTarget(error) !== null;
		return { ok: false, left, refreshNeeded: !left && isSessionRefreshNeeded(error) };
	}
}
