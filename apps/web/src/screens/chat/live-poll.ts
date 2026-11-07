// Real mode only. The chat panel asks the router to re-run its loaders, so replies
// from real agents appear without a reload. Test mode never polls.
// The reads go to Neon only. They do not touch the account's Durable Object.
export const CHAT_POLL_MS = 5000;

export interface PollClock {
	readonly every: (ms: number, run: () => void) => () => void;
	readonly hidden: () => boolean;
	readonly onVisibility: (run: () => void) => () => void;
}

// Returns a stop function. A hidden tab stops the timer. A visible tab refreshes at once and restarts it.
// A refresh still running blocks the next tick, so reads never pile up.
export function startChatPoll(live: boolean, refresh: () => Promise<void>, clock: PollClock): () => void {
	if (!live) return () => undefined;
	let cancelTimer: (() => void) | null = null;
	let busy = false;
	const tick = () => {
		if (busy) return;
		busy = true;
		new Promise<void>((resolve) => resolve(refresh()))
			.catch(() => undefined)
			.then(() => {
				busy = false;
			});
	};
	const start = () => {
		if (cancelTimer === null) cancelTimer = clock.every(CHAT_POLL_MS, tick);
	};
	const stop = () => {
		cancelTimer?.();
		cancelTimer = null;
	};
	const onVisibility = () => {
		if (clock.hidden()) {
			stop();
			return;
		}
		tick();
		start();
	};
	if (!clock.hidden()) start();
	const unlisten = clock.onVisibility(onVisibility);
	return () => {
		unlisten();
		stop();
	};
}

export function browserClock(): PollClock {
	return {
		every: (ms, run) => {
			const id = window.setInterval(run, ms);
			return () => window.clearInterval(id);
		},
		hidden: () => document.visibilityState === "hidden",
		onVisibility: (run) => {
			document.addEventListener("visibilitychange", run);
			return () => document.removeEventListener("visibilitychange", run);
		},
	};
}
