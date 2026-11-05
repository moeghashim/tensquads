import { useAuth } from "@clerk/tanstack-react-start";
import { Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useCallback, useRef, useSyncExternalStore } from "react";

import { nextReread, workspaceChildAccount } from "./account-match.ts";

// The frame and a screen load together. A screen paints only when its account
// is the frame's account. A mismatch is discarded and read once more.
export function MatchedChild({ frameAccountId }: { readonly frameAccountId: string }) {
	const { userId } = useAuth();
	const router = useRouter();
	const childAccountId = useRouterState({ select: (state) => workspaceChildAccount(state.matches) });
	const tried = useRef<string | null>(null);
	const matched = accountsMatch(childAccountId, frameAccountId);
	if (matched) tried.current = null;
	const pending = nextReread(userId ?? null, frameAccountId, childAccountId, tried.current);
	useOneReread(pending, () => {
		tried.current = pending;
		void router.invalidate();
	});
	if (!matched) return null;
	return <Outlet />;
}

function accountsMatch(childAccountId: string | null, frameAccountId: string): boolean {
	return childAccountId === null || childAccountId === frameAccountId;
}

function emptySnapshot(): null {
	return null;
}

function useOneReread(pending: string | null, reread: () => void) {
	const run = useRef(reread);
	run.current = reread;
	const sent = useRef<string | null>(null);
	if (pending === null) sent.current = null;
	const subscribe = useCallback(
		(_onStoreChange: () => void) => {
			if (pending === null || sent.current === pending) return () => undefined;
			sent.current = pending;
			queueMicrotask(() => run.current());
			return () => undefined;
		},
		[pending],
	);
	useSyncExternalStore(subscribe, emptySnapshot, emptySnapshot);
}
