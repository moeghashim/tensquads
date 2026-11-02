import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";

export interface DecisionResult {
	readonly wrote: boolean;
	readonly refreshed: boolean;
}

interface Job {
	readonly key: string;
	readonly work: (signal: AbortSignal) => Promise<unknown>;
	readonly refresh: () => Promise<unknown>;
	readonly settled: (result: DecisionResult) => void;
}

const keys = new Set<string>();
const jobs: Job[] = [];
const listeners = new Set<() => void>();
let running = false;
let generation = 0;
let target: number | null = null;
let pendingHolds = 0;

export function resetDecisions(): void {
	generation += 1;
	keys.clear();
	jobs.length = 0;
	running = false;
	target = null;
	pendingHolds = 0;
	notify();
}

export function shownApprovalCount(serverCount: number): number {
	return target === null ? serverCount : target;
}

export function subscribeDecisions(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function decisionSnapshot(): number | null {
	return target;
}

// One card keeps one place in the queue. A second click on that card does nothing.
// Different cards run one at a time, in click order.
export function enqueueDecision(
	key: string,
	serverCount: number,
	work: (signal: AbortSignal) => Promise<unknown>,
	refresh: () => Promise<unknown>,
	settled: (result: DecisionResult) => void,
): boolean {
	if (keys.has(key)) {
		return false;
	}
	keys.add(key);
	hold(serverCount);
	jobs.push({ key, work, refresh, settled });
	pump();
	return true;
}

function hold(serverCount: number): void {
	const base = target === null ? serverCount : target;
	target = Math.max(0, base - 1);
	pendingHolds += 1;
	notify();
}

function settle(ok: boolean, refreshed: boolean): void {
	pendingHolds = Math.max(0, pendingHolds - 1);
	if (!ok && target !== null) {
		target += 1;
	}
	if (pendingHolds === 0 && (!ok || refreshed)) {
		target = null;
	}
	notify();
}

function pump(): void {
	if (running) {
		return;
	}
	const job = jobs.shift();
	if (!job) {
		return;
	}
	running = true;
	const gen = generation;
	void runJob(job, gen);
}

async function runJob(job: Job, gen: number): Promise<void> {
	const result = await runBounded(job);
	if (gen !== generation) {
		return;
	}
	job.settled(result);
	settle(result.wrote, result.refreshed);
	keys.delete(job.key);
	running = false;
	queueMicrotask(() => {
		if (gen === generation) {
			pump();
		}
	});
}

async function runBounded(job: Job): Promise<DecisionResult> {
	let wrote = true;
	try {
		await bounded(job.work);
	} catch {
		wrote = false;
	}
	let refreshed = false;
	try {
		await bounded(() => job.refresh());
		refreshed = true;
	} catch {
		refreshed = false;
	}
	return { wrote, refreshed };
}

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
		if (timer !== undefined) {
			clearTimeout(timer);
		}
	});
}

function notify(): void {
	for (const listener of listeners) {
		listener();
	}
}
