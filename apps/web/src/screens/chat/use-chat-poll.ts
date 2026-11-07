import { useCallback, useRef, useSyncExternalStore } from "react";

import { browserClock, startChatPoll } from "./live-poll.ts";

function idleSnapshot(): null {
	return null;
}

// The poll runs outside React, like the traffic clock. It must not re-render the page.
export function useChatPoll(live: boolean, refresh: () => Promise<void>): void {
	const latest = useRef(refresh);
	latest.current = refresh;
	const subscribe = useCallback(
		(_onStoreChange: () => void) => startChatPoll(live, () => latest.current(), browserClock()),
		[live],
	);
	useSyncExternalStore(subscribe, idleSnapshot, idleSnapshot);
}
