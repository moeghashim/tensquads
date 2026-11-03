import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";

import { advanceWrites, currentWrites } from "#/workspace/approval-count.ts";

import type { DecisionPatch } from "./view.ts";

export interface DecisionRow {
	readonly id: string;
	readonly status: string;
	readonly count: number;
}

export interface DecisionRefresh {
	readonly count: number;
	readonly readAt: number;
	readonly dropLanded: boolean;
}

export interface DecisionResult {
	readonly wrote: boolean;
	readonly refreshed: boolean;
	readonly count: number | null;
	readonly row: DecisionRow | null;
	readonly readAt: number | null;
	readonly dropLanded: boolean;
}

interface Job {
	readonly key: string;
	readonly work: (signal: AbortSignal) => Promise<unknown>;
	readonly refresh: () => Promise<number | DecisionRefresh>;
	readonly settled: (result: DecisionResult) => void;
}

const keys = new Set<string>();
const jobs: Job[] = [];
const listeners = new Set<() => void>();
let running = false;
let generation = 0;
let target: number | null = null;
let patches: readonly DecisionPatch[] = [];
const landed = new Map<string, number>();
let activeKey: string | null = null;
let seenServer: object | null = null;

function emptyResult(): DecisionResult {
	return { wrote: false, refreshed: false, count: null, row: null, readAt: null, dropLanded: false };
}

export function decisionGeneration(): number {
	return generation;
}

// The signed-in account changed, or the user signed out. A read that already
// started belongs to the previous account, so the counter moves too.
export function resetDecisions(): void {
	generation += 1;
	keys.clear();
	jobs.length = 0;
	running = false;
	target = null;
	patches = [];
	landed.clear();
	activeKey = null;
	seenServer = null;
	advanceWrites();
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

// The dock and the inbox pass the workspace count. A click lowers both.
export function badgeCount(count: number): number {
	return shownApprovalCount(count);
}

export function subscribeOverviewPage(listener: () => void): () => void {
	return subscribeDecisions(listener);
}

export function readDecisionCount(value: unknown): number | null {
	return decisionRow(value)?.count ?? null;
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
	refresh: () => Promise<number | DecisionRefresh>,
	settled: (result: DecisionResult) => void,
): boolean {
	const key = patch.key;
	if (keys.has(key) || patches.some((item) => item.key === key)) {
		return false;
	}
	advanceWrites();
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

// A landed patch stays until a read that started after the write landed.
// Finishing the write does not drop it. A frame read drops only a write that
// never landed. The badge counts cards that are still queued or in flight.
export function reconcileDecisions(serverCount: number, readAt = currentWrites(), dropLanded = true): void {
	const live = liveKeys();
	const next: DecisionPatch[] = [];
	let pending = 0;
	let dropped = false;
	for (const patch of patches) {
		const land = landed.get(patch.key);
		if (live.has(patch.key)) {
			next.push(patch);
			if (land === undefined) {
				pending += 1;
			}
			continue;
		}
		if (land !== undefined && (!dropLanded || readAt < land)) {
			next.push(patch);
			continue;
		}
		keys.delete(patch.key);
		landed.delete(patch.key);
		dropped = true;
	}
	const nextTarget = pending === 0 ? null : Math.max(0, serverCount - pending);
	if (!dropped && nextTarget === target && next.length === patches.length) {
		return;
	}
	patches = next;
	target = nextTarget;
	notify();
}

export function watchServerCount(serverCount: number, token: object, readAt: number): void {
	if (token === seenServer) {
		return;
	}
	seenServer = token;
	const gen = generation;
	queueMicrotask(() => {
		if (gen !== generation) {
			return;
		}
		if (patches.every((patch) => liveKeys().has(patch.key))) {
			return;
		}
		reconcileDecisions(serverCount, readAt, false);
	});
}

// The overview page that is on screen started at readAt. A fresh one replaces the overlay.
export function acceptOverviewRead(serverCount: number, readAt: number): void {
	if (currentWrites() !== readAt) {
		return;
	}
	reconcileDecisions(serverCount, readAt, true);
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
	const result = await runBounded(job, gen);
	if (gen !== generation) {
		job.settled(emptyResult());
		return;
	}
	if (activeKey === job.key) {
		activeKey = null;
	}
	if (result.count !== null && result.readAt !== null) {
		reconcileDecisions(result.count, result.readAt, result.dropLanded);
	}
	job.settled(result);
	running = false;
	queueMicrotask(() => {
		if (gen === generation) {
			pump();
		}
	});
}

async function runBounded(job: Job, gen: number): Promise<DecisionResult> {
	let wrote = true;
	let row: DecisionRow | null = null;
	try {
		row = decisionRow(await bounded(job.work));
	} catch {
		wrote = false;
		row = null;
	}
	if (gen !== generation) {
		return emptyResult();
	}
	advanceWrites();
	if (wrote) {
		landed.set(job.key, currentWrites());
	}
	try {
		const read = asRefresh(await bounded(() => job.refresh()));
		if (gen !== generation) {
			return emptyResult();
		}
		return { wrote, refreshed: true, count: read.count, row, readAt: read.readAt, dropLanded: read.dropLanded };
	} catch {
		return { wrote, refreshed: false, count: null, row, readAt: null, dropLanded: false };
	}
}

function asRefresh(value: number | DecisionRefresh): DecisionRefresh {
	if (typeof value === "number") {
		return { count: value, readAt: currentWrites(), dropLanded: true };
	}
	return value;
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
