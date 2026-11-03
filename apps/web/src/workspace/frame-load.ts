import { isRedirect } from "@tanstack/react-router";

import { isSessionRefreshNeeded } from "#/server/session-error.ts";
import { currentWrites } from "#/workspace/approval-count.ts";

import type { WorkspaceFrameData } from "./types.ts";

export interface FrameHeld extends WorkspaceFrameData {
	readonly writeAt: number;
}

let held: FrameHeld | null = null;
let needsRead = false;
let epoch = 0;
const accountResets = new Set<() => void>();

export function onFrameAccountReset(reset: () => void): void {
	accountResets.add(reset);
}

function inBrowser(): boolean {
	return import.meta.env?.SSR !== true;
}

export function frameEpoch(): number {
	return epoch;
}

export function frameNeedsRead(): boolean {
	return needsRead;
}

export function clearFrameHold(): void {
	held = null;
	needsRead = false;
	epoch += 1;
}

export function rememberFrame(frame: FrameHeld): void {
	if (!inBrowser() || needsRead || currentWrites() !== frame.writeAt) return;
	held = frame;
}

function acceptFrameLoad(writeAt: number, data: WorkspaceFrameData, epochAtStart: number): FrameHeld {
	const frame = { ...data, writeAt };
	if (!inBrowser() || epochAtStart !== epoch) return frame;
	if (held !== null && held.accountId !== frame.accountId) {
		for (const reset of accountResets) reset();
	} else if (currentWrites() !== writeAt) {
		return frame;
	}
	held = frame;
	needsRead = false;
	return frame;
}

function retainFailedFrame(epochAtStart: number): FrameHeld | null {
	if (!inBrowser() || epochAtStart !== epoch || held === null) return null;
	needsRead = true;
	return held;
}

export async function loadHeldFrame(
	epochAtStart: number,
	writeAt: number,
	read: () => Promise<WorkspaceFrameData>,
): Promise<FrameHeld> {
	try {
		return acceptFrameLoad(writeAt, await read(), epochAtStart);
	} catch (error) {
		// A signed-out redirect, and a session refresh, are not failed reads.
		if (isRedirect(error) || isSessionRefreshNeeded(error)) throw error;
		const kept = retainFailedFrame(epochAtStart);
		if (!kept) throw error;
		return kept;
	}
}
