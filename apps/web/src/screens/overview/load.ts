import type { OverviewData } from "./types.ts";

export interface OverviewHeld extends OverviewData {
	readonly writeAt: number;
}

let held: OverviewHeld | null = null;
let needsRead = false;
let epoch = 0;

function inBrowser(): boolean {
	return import.meta.env?.SSR !== true;
}

export function overviewEpoch(): number {
	return epoch;
}

export function overviewNeedsRead(): boolean {
	return needsRead;
}

export function clearOverviewHold(): void {
	held = null;
	needsRead = false;
	epoch += 1;
}

export function rememberOverview(page: OverviewHeld): void {
	if (!inBrowser() || needsRead) return;
	held = page;
}

function acceptOverviewLoad(writeAt: number, data: OverviewData, epochAtStart: number): OverviewHeld {
	const page = { ...data, writeAt };
	if (!inBrowser() || epochAtStart !== epoch) return page;
	held = page;
	needsRead = false;
	return page;
}

function retainFailedOverview(epochAtStart: number): OverviewHeld | null {
	if (!inBrowser() || epochAtStart !== epoch || held === null) return null;
	needsRead = true;
	return held;
}

export async function loadHeldOverview(
	epochAtStart: number,
	writeAt: number,
	read: () => Promise<OverviewData>,
): Promise<OverviewHeld> {
	try {
		return acceptOverviewLoad(writeAt, await read(), epochAtStart);
	} catch (error) {
		const kept = retainFailedOverview(epochAtStart);
		if (!kept) throw error;
		return kept;
	}
}
