import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";

export interface LiveTick {
	readonly accountId: string;
	readonly live: boolean;
	readonly refresh: () => void | Promise<void>;
}

// The route registers this call. This file cannot import the server function.
// The dock bundle test compiles this module without the server-function compiler.
type Advance = (options: { data: string; signal: AbortSignal }) => Promise<string>;
let advance: Advance | null = null;

export function registerTrafficAdvance(fn: Advance) {
	advance = fn;
}

let pending = false;
let queuedEventId = "";

interface QueuedClick {
	readonly accountId: string;
	readonly refresh: () => void | Promise<void>;
	readonly resolve: () => void;
	readonly reject: (error: unknown) => void;
}

const clicks: QueuedClick[] = [];

function noteSelection(id: string) {
	if (id.length > 0) queuedEventId = id;
}

export function consumeQueuedEvent(): string {
	const id = queuedEventId;
	queuedEventId = "";
	return id;
}

// Advance and refresh each wait up to 30 seconds, so one step can take 60.
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

async function step(accountId: string, refresh: () => void | Promise<void>): Promise<void> {
	let id = "";
	try {
		const call = advance;
		if (!call) throw new Error("Traffic advance is not configured.");
		id = await bounded((signal) => call({ data: accountId, signal }));
	} catch {
		id = "";
	}
	noteSelection(id);
	try {
		await bounded(async () => refresh());
	} catch {
		// A failed refresh still clears the guard.
	}
}

function pump(): void {
	if (pending) return;
	const next = clicks.shift();
	if (!next) return;
	pending = true;
	void runOwned(next.accountId, next.refresh, next);
}

async function runOwned(accountId: string, refresh: () => void | Promise<void>, done: QueuedClick | null): Promise<void> {
	try {
		await step(accountId, refresh);
		done?.resolve();
	} catch (error) {
		if (done) {
			done.reject(error);
			return;
		}
		throw error;
	} finally {
		pending = false;
		// Resolve the click before the next advance notes its id.
		queueMicrotask(() => {
			pump();
		});
	}
}

export async function runLiveTick(tick: LiveTick): Promise<void> {
	if (!tick.live || pending || clicks.length > 0) return;
	pending = true;
	await runOwned(tick.accountId, tick.refresh, null);
}

export function sendNextEvent(refresh: () => void | Promise<void>, accountId: string): Promise<void> {
	return new Promise((resolve, reject) => {
		clicks.push({ accountId, refresh, resolve, reject });
		pump();
	});
}
