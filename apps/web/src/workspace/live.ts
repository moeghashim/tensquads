import { bounded } from "./bounded.ts";
import { settleWrite } from "./write-result.ts";

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
let retired = false;
let queuedEventId = "";

interface QueuedClick {
	readonly accountId: string;
	readonly refresh: () => void | Promise<void>;
	readonly resolve: () => void;
	readonly reject: (error: unknown) => void;
}

const clicks: QueuedClick[] = [];

export function retireLiveQueue(): void {
	retired = true;
	clicks.length = 0;
}

function stopped(): boolean {
	return retired;
}

function noteSelection(id: string) {
	if (id.length > 0) queuedEventId = id;
}

export function consumeQueuedEvent(): string {
	const id = queuedEventId;
	queuedEventId = "";
	return id;
}

// Advance and refresh each wait up to 30 seconds, so one step can take 60.
async function step(accountId: string, refresh: () => void | Promise<void>): Promise<void> {
	const settled = await settledAdvance(accountId);
	// The document is leaving. The click must not settle as an empty success.
	if (!settled.ok && settled.left) return new Promise(() => undefined);
	if (stopped()) return;
	// The shared session refresh already reloads the router. This screen must not reload again.
	if (!settled.ok && settled.refreshNeeded) return;
	noteSelection(settled.ok ? settled.value : "");
	await refreshed(refresh);
}

function settledAdvance(accountId: string) {
	return settleWrite(() => {
		const call = advance;
		if (!call) throw new Error("Traffic advance is not configured.");
		return bounded((signal) => call({ data: accountId, signal }));
	});
}

async function refreshed(refresh: () => void | Promise<void>): Promise<void> {
	try {
		await bounded(async () => refresh());
	} catch {
		// A failed refresh still clears the guard.
	}
}

function pump(): void {
	if (stopped() || pending) return;
	const next = clicks.shift();
	if (!next) return;
	pending = true;
	void runOwned(next.accountId, next.refresh, next);
}

async function runOwned(
	accountId: string,
	refresh: () => void | Promise<void>,
	done: QueuedClick | null,
): Promise<void> {
	try {
		await step(accountId, refresh);
		if (stopped()) return;
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
	if (stopped() || !tick.live || pending || clicks.length > 0) return;
	pending = true;
	await runOwned(tick.accountId, tick.refresh, null);
}

export function sendNextEvent(refresh: () => void | Promise<void>, accountId: string): Promise<void> {
	if (stopped()) return new Promise(() => undefined);
	return new Promise((resolve, reject) => {
		clicks.push({ accountId, refresh, resolve, reject });
		pump();
	});
}
