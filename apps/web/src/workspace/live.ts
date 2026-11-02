import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";

import { advanceTraffic } from "#/server/traffic.ts";

export interface LiveTick {
	readonly live: boolean;
	readonly refresh: () => void | Promise<void>;
}

let pending = false;
let queuedEventId = "";

function noteSelection(id: string) {
	if (id.length > 0) queuedEventId = id;
}

export function consumeQueuedEvent(): string {
	const id = queuedEventId;
	queuedEventId = "";
	return id;
}

// The provider keeps bounded() private. This race is the same 30 second window.
function bounded<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			reject(new DOMException("The operation was aborted.", "AbortError"));
		}, PENDING_TASK_WINDOW_MS);
	});
	const work = Promise.resolve().then(() => run(controller.signal));
	void work.then(
		() => undefined,
		() => undefined,
	);
	return Promise.race([work, timeout]).finally(() => {
		if (timer !== undefined) clearTimeout(timer);
	});
}

async function step(refresh: () => void | Promise<void>): Promise<void> {
	let id = "";
	try {
		id = await bounded((signal) => advanceTraffic({ signal }));
	} catch {
		id = "";
	}
	noteSelection(id);
	try {
		await Promise.resolve(refresh());
	} catch {
		// A failed refresh still clears the guard.
	}
}

async function runStep(refresh: () => void | Promise<void>): Promise<void> {
	pending = true;
	try {
		await step(refresh);
	} finally {
		pending = false;
	}
}

export async function runLiveTick(tick: LiveTick): Promise<void> {
	if (!tick.live || pending) return;
	await runStep(tick.refresh);
}

export async function sendNextEvent(refresh: () => void | Promise<void>): Promise<void> {
	if (pending) return;
	await runStep(refresh);
}
