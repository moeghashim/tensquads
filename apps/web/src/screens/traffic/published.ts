import { advanceWrites } from "#/workspace/approval-count.ts";

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

// The row is on screen when the send returns. A traffic read that started earlier
// has a smaller writeAt and does not include this event.
export function publishTrafficEvent(accountId: string, event: TrafficEvent): void {
	published = [...published, { accountId, event, writeAt: advanceWrites() }];
	emit();
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
