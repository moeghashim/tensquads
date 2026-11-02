import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";

import type { DecisionPatch } from "./view.ts";

export interface DecisionRow {
	readonly id: string;
	readonly status: string;
	readonly count: number;
}

export interface DecisionResult {
	readonly wrote: boolean;
	readonly refreshed: boolean;
	readonly count: number | null;
	readonly row: DecisionRow | null;
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
let published: number | null = null;
let overviewLive = false;
let overviewSubs = 0;
let patches: readonly DecisionPatch[] = [];
let activeKey: string | null = null;
let seenServer: object | null = null;

export function resetDecisions(): void {
	generation += 1;
	keys.clear();
	jobs.length = 0;
	running = false;
	target = null;
	published = null;
	overviewLive = overviewSubs > 0;
	patches = [];
	activeKey = null;
	seenServer = null;
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

// The dock and the inbox both read this. While Overview is open, the published
// overview count wins over the frame count the provider can hold during a send.
export function badgeCount(frameCount: number): number {
	if (overviewLive && published !== null) {
		return shownApprovalCount(published);
	}
	return target === null ? frameCount : target;
}

export function subscribeOverviewPage(listener: () => void): () => void {
	overviewSubs += 1;
	overviewLive = true;
	const stop = subscribeDecisions(listener);
	return () => {
		stop();
		overviewSubs = Math.max(0, overviewSubs - 1);
		if (overviewSubs === 0) {
			overviewLive = false;
			published = null;
			notify();
		}
	};
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
	if (keys.has(key) || patches.some((item) => item.key === key)) {
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

function liveKeys(): Set<string> {
	const live = new Set(jobs.map((item) => item.key));
	if (activeKey !== null) {
		live.add(activeKey);
	}
	return live;
}

// A count from the server drops patches whose writes have finished.
// A card that is still queued or in flight stays, and the badge is the server
// count minus those cards. A refresh that returns no count leaves its patch
// in place, so a second click on that card still sends nothing.
export function reconcileDecisions(serverCount: number): void {
	const live = liveKeys();
	const next: DecisionPatch[] = [];
	let dropped = false;
	for (const patch of patches) {
		if (live.has(patch.key)) {
			next.push(patch);
			continue;
		}
		keys.delete(patch.key);
		dropped = true;
	}
	const nextTarget = next.length === 0 ? null : Math.max(0, serverCount - next.length);
	const publishedChanged = published !== serverCount;
	published = serverCount;
	if (!dropped && nextTarget === target && !publishedChanged) {
		return;
	}
	patches = next;
	target = nextTarget;
	notify();
}

export function watchServerCount(serverCount: number, token: object): void {
	const publishedChanged = published !== serverCount;
	published = serverCount;
	if (token === seenServer) {
		if (publishedChanged) {
			const gen = generation;
			queueMicrotask(() => {
				if (gen === generation) {
					notify();
				}
			});
		}
		return;
	}
	seenServer = token;
	const gen = generation;
	queueMicrotask(() => {
		if (gen !== generation) {
			return;
		}
		if (patches.every((patch) => liveKeys().has(patch.key))) {
			if (publishedChanged) {
				notify();
			}
			return;
		}
		reconcileDecisions(serverCount);
	});
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
	activeKey = job.key;
	const result = await runBounded(job);
	if (activeKey === job.key) {
		activeKey = null;
	}
	if (gen !== generation) {
		return;
	}
	if (result.count !== null) {
		reconcileDecisions(result.count);
	}
	job.settled(result);
	running = false;
	queueMicrotask(() => {
		if (gen === generation) {
			pump();
		}
	});
}

async function runBounded(job: Job): Promise<DecisionResult> {
	let wrote = true;
	let row: DecisionRow | null = null;
	try {
		row = decisionRow(await bounded(job.work));
	} catch {
		wrote = false;
		row = null;
	}
	let count: number | null = null;
	let refreshed = false;
	try {
		count = await bounded(() => job.refresh());
		refreshed = true;
	} catch {
		refreshed = false;
	}
	return { wrote, refreshed, count, row };
}

function decisionRow(value: unknown): DecisionRow | null {
	if (typeof value !== "object" || value === null) {
		return null;
	}
	if (!("id" in value) || !("status" in value) || !("count" in value)) {
		return null;
	}
	const id = value.id;
	const status = value.status;
	const count = value.count;
	if (typeof id !== "string" || id.length === 0 || typeof status !== "string" || typeof count !== "number") {
		return null;
	}
	return { id, status, count };
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
