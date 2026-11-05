import { advanceWrites } from "#/workspace/approval-count.ts";
import { onFrameAccountReset } from "#/workspace/frame-load.ts";

import type { TrafficEvent } from "./view.ts";

export interface PublishedTraffic {
	readonly accountId: string;
	readonly event: TrafficEvent;
	readonly writeAt: number;
}

const none: readonly PublishedTraffic[] = [];
let published: readonly PublishedTraffic[] = none;
const listeners = new Set<() => void>();

function emit(): void {
	for (const listener of listeners) listener();
}

let accountGeneration = 0;

export function trafficAccountGeneration(): number {
	return accountGeneration;
}

// The row is on screen when the send returns. A traffic read that started earlier
// has a smaller writeAt and does not include this event. A response that started
// on an earlier account generation is dropped: the reset already cleared that account.
export function publishTrafficEvent(accountId: string, event: TrafficEvent, generation: number): boolean {
	if (generation !== accountGeneration) return false;
	published = [...published, { accountId, event, writeAt: advanceWrites() }];
	emit();
	return true;
}

export function subscribePublishedTraffic(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function publishedTrafficSnapshot(): readonly PublishedTraffic[] {
	return published;
}

export function publishedTrafficServerSnapshot(): readonly PublishedTraffic[] {
	return none;
}

export function shownTrafficEvents(
	data: { readonly accountId: string; readonly events: readonly TrafficEvent[]; readonly writeAt: number },
	pending: readonly PublishedTraffic[],
): readonly TrafficEvent[] {
	let events = data.events;
	for (const item of pending) {
		if (item.accountId !== data.accountId || data.writeAt >= item.writeAt) continue;
		if (events.some((event) => event.id === item.event.id)) continue;
		events = [...events, item.event];
	}
	return events;
}

export function pendingTrafficId(accountId: string, pending: readonly PublishedTraffic[]): string {
	let id = "";
	for (const item of pending) {
		if (item.accountId === accountId) id = item.event.id;
	}
	return id;
}

let watchedAccount = "";

// The frame account reset drops every painted row, including one published before Traffic renders.
function clearPublishedAccount(): void {
	accountGeneration += 1;
	watchedAccount = "";
	if (published.length === 0) return;
	published = none;
	emit();
}

onFrameAccountReset(clearPublishedAccount);

// A switch drops every painted row. The first account keeps a row painted before the page mounted.
export function watchTrafficAccount(nextAccountId: string): void {
	if (watchedAccount === nextAccountId) return;
	const previous = watchedAccount;
	watchedAccount = nextAccountId;
	if (previous.length === 0 || published.length === 0) return;
	published = none;
}

// A read that already contains the row no longer needs the painted copy.
export function retirePublishedTraffic(
	accountId: string,
	events: readonly { readonly id: string }[],
	writeAt: number,
): void {
	const ids = new Set(events.map((event) => event.id));
	const next = published.filter((item) => {
		if (item.accountId !== accountId || writeAt < item.writeAt) return true;
		return !ids.has(item.event.id);
	});
	if (next.length === published.length) return;
	published = next;
}

// The page calls this while rendering. The visible list is derived from the same rules.
export function settlePublishedTraffic(
	accountId: string,
	events: readonly { readonly id: string }[],
	writeAt: number,
): void {
	watchTrafficAccount(accountId);
	retirePublishedTraffic(accountId, events, writeAt);
}
