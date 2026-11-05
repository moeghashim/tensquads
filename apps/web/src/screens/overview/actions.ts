import { onRulesAccountReset } from "#/screens/rules/write-queue.ts";
import { advanceWrites, currentWrites } from "#/workspace/approval-count.ts";
import { bounded } from "#/workspace/bounded.ts";
import { clearFrameHold } from "#/workspace/frame-load.ts";
import { settleWrite } from "#/workspace/write-result.ts";

import { clearOverviewHold } from "./load.ts";
import type { OverviewData } from "./types.ts";
import { type DecisionPatch, presentOverview } from "./view.ts";

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
	readonly left: boolean;
	readonly refreshNeeded: boolean;
}

interface Job {
	readonly key: string;
	readonly work: (signal: AbortSignal) => Promise<unknown>;
	readonly refresh: () => Promise<DecisionRefresh>;
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
const reflected = new Set<string>();
let activeKey: string | null = null;
let seenServer: object | null = null;

onRulesAccountReset(resetDecisions);

function emptyResult(): DecisionResult {
	return {
		wrote: false,
		refreshed: false,
		count: null,
		row: null,
		readAt: null,
		dropLanded: false,
		left: false,
		refreshNeeded: false,
	};
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
	reflected.clear();
	activeKey = null;
	seenServer = null;
	clearOverviewHold();
	clearFrameHold();
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
	refresh: () => Promise<DecisionRefresh>,
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

// An Overview patch stays until an Overview read that started after the write.
// The write may succeed or fail. A frame read changes the badge count only.
export function reconcileDecisions(serverCount: number, readAt = currentWrites(), dropLanded = true): void {
	const live = liveKeys();
	const next: DecisionPatch[] = [];
	let pending = 0;
	let dropped = false;
	for (const patch of patches) {
		const land = landed.get(patch.key);
		if (live.has(patch.key)) {
			next.push(patch);
			if (land === undefined && !reflected.has(patch.key)) {
				pending += 1;
			}
			continue;
		}
		if (!dropLanded || (land !== undefined && readAt < land)) {
			next.push(patch);
			continue;
		}
		keys.delete(patch.key);
		landed.delete(patch.key);
		reflected.delete(patch.key);
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
export function acceptOverviewRead(data: OverviewData, readAt: number): void {
	if (currentWrites() !== readAt) {
		return;
	}
	for (const patch of patches) {
		if (presentOverview(data, [patch]) === data) {
			reflected.add(patch.key);
		} else {
			reflected.delete(patch.key);
		}
	}
	reconcileDecisions(data.count, readAt, true);
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
	if (result.left) {
		job.settled(result);
		running = false;
		return;
	}
	if (!result.wrote && result.refreshNeeded) {
		releaseFailed(job.key, result.count === null || result.readAt === null);
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
	const settled = await settleWrite(() => bounded(job.work));
	if (gen !== generation) {
		return emptyResult();
	}
	if (!settled.ok && settled.left) {
		return { ...emptyResult(), left: true };
	}
	const wrote = settled.ok;
	const row = settled.ok ? decisionRow(settled.value) : null;
	const refreshNeeded = !settled.ok && settled.refreshNeeded;
	advanceWrites();
	landed.set(job.key, currentWrites());
	try {
		const read = await bounded(() => job.refresh());
		if (gen !== generation) {
			return emptyResult();
		}
		return {
			wrote,
			refreshed: true,
			count: read.count,
			row,
			readAt: read.readAt,
			dropLanded: read.dropLanded,
			left: false,
			refreshNeeded,
		};
	} catch {
		return { wrote, refreshed: false, count: null, row, readAt: null, dropLanded: false, left: false, refreshNeeded };
	}
}

// The write did not run. Drop its optimistic card and give the badge back.
function releaseFailed(key: string, undoHold: boolean): void {
	if (!patches.some((patch) => patch.key === key)) return;
	keys.delete(key);
	landed.delete(key);
	reflected.delete(key);
	patches = patches.filter((patch) => patch.key !== key);
	if (!undoHold) {
		notify();
		return;
	}
	const live = liveKeys();
	let pending = 0;
	for (const patch of patches) {
		if (live.has(patch.key) && landed.get(patch.key) === undefined && !reflected.has(patch.key)) pending += 1;
	}
	target = pending === 0 ? null : (target ?? 0) + 1;
	notify();
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

function notify(): void {
	for (const listener of listeners) {
		listener();
	}
}
