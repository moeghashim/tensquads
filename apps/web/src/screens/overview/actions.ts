import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";

import type { DecisionPatch } from "./view.ts";

export interface DecisionResult {
	readonly wrote: boolean;
	readonly refreshed: boolean;
	readonly count: number | null;
}

interface Job {
	readonly key: string;
	readonly work: (signal: AbortSignal) => Promise<unknown>;
	readonly refresh: () => Promise<number>;
	readonly settled: (result: DecisionResult) => void;
}

const keys = new Set<string>();
const jobs: Job[] = [];
const listeners = new Set<() => void>();
let running = false;
let generation = 0;
let target: number | null = null;
let patches: readonly DecisionPatch[] = [];

export function resetDecisions(): void {
	generation += 1;
	keys.clear();
	jobs.length = 0;
	running = false;
	target = null;
	patches = [];
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

export function patchSnapshot(): readonly DecisionPatch[] {
	return patches;
}

// One card keeps one place in the queue. A second click on that card does nothing.
// Different cards run one at a time, in click order.
export function enqueueDecision(
	patch: DecisionPatch,
	serverCount: number,
	work: (signal: AbortSignal) => Promise<unknown>,
	refresh: () => Promise<number>,
	settled: (result: DecisionResult) => void,
): boolean {
	const key = patch.key;
	if (keys.has(key)) {
		return false;
	}
	keys.add(key);
	patches = [...patches, patch];
	hold(serverCount);
	jobs.push({ key, work, refresh, settled });
	pump();
	return true;
}

function hold(serverCount: number): void {
	const base = target === null ? serverCount : target;
	target = Math.max(0, base - 1);
	notify();
}

function settle(job: Job, result: DecisionResult): void {
	if (result.count !== null) {
		patches = patches.filter((patch) => patch.key !== job.key && keys.has(patch.key));
		target = patches.length === 0 ? null : Math.max(0, result.count - patches.length);
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
	settle(job, result);
	job.settled(result);
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
	let count: number | null = null;
	let refreshed = false;
	try {
		count = await bounded(() => job.refresh());
		refreshed = true;
	} catch {
		refreshed = false;
	}
	return { wrote, refreshed, count };
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
