import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";
import { useSyncExternalStore } from "react";

import { setRuleEnabled, setRuleLimit } from "#/server/rules.ts";

interface Flight<T> {
	readonly baseline: T;
	shown: T;
	confirmed: T;
	sending: boolean;
	queued: T | null;
}

const ruleFlights = new Map<string, Flight<boolean>>();
const limitFlights = new Map<string, Flight<number>>();
const listeners = new Set<() => void>();
let version = 0;

export function useRuleWrites(): number {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => version,
		() => version,
	);
}

export function shownOn(id: string, loaded: boolean): boolean {
	return shownValue(ruleFlights, id, loaded);
}

export function shownLimit(key: string, loaded: number): number {
	return shownValue(limitFlights, key, loaded);
}

export function queueRule(id: string, next: boolean, loaded: boolean, refresh: () => Promise<void>): void {
	const flight = queueValue(ruleFlights, id, next, loaded);
	if (!flight) {
		return;
	}
	void run(flight, (value, signal) => setRuleEnabled({ data: { id, on: value }, signal }), refresh);
}

export function queueLimit(key: string, next: number, loaded: number, refresh: () => Promise<void>): void {
	const flight = queueValue(limitFlights, key, next, loaded);
	if (!flight) {
		return;
	}
	void run(flight, (value, signal) => setRuleLimit({ data: { key, value }, signal }), refresh);
}

function queueValue<T>(map: Map<string, Flight<T>>, key: string, next: T, loaded: T): Flight<T> | null {
	const flight = map.get(key) ?? createFlight(map, key, next, loaded);
	if (flight.sending) {
		flight.shown = next;
		flight.queued = next;
		notify();
		return null;
	}
	flight.shown = next;
	flight.queued = null;
	return flight;
}

function createFlight<T>(map: Map<string, Flight<T>>, key: string, next: T, loaded: T): Flight<T> {
	const flight = { baseline: loaded, shown: next, confirmed: loaded, sending: false, queued: null };
	map.set(key, flight);
	return flight;
}

async function run<T>(
	flight: Flight<T>,
	send: (value: T, signal: AbortSignal) => Promise<unknown>,
	refresh: () => Promise<void>,
): Promise<void> {
	flight.sending = true;
	notify();
	await sendUntilQuiet(flight, send);
	await bounded(() => refresh()).catch(() => undefined);
	const next = flight.queued;
	flight.queued = null;
	if (next === null) {
		flight.sending = false;
		notify();
		return;
	}
	flight.shown = next;
	await run(flight, send, refresh);
}

async function sendUntilQuiet<T>(
	flight: Flight<T>,
	send: (value: T, signal: AbortSignal) => Promise<unknown>,
): Promise<void> {
	while (true) {
		const sent = flight.queued ?? flight.shown;
		flight.queued = null;
		const wrote = await sendValue(flight, send, sent);
		if (!wrote) {
			return;
		}
		if (flight.queued === null) {
			flight.shown = sent;
			return;
		}
	}
}

async function sendValue<T>(
	flight: Flight<T>,
	send: (value: T, signal: AbortSignal) => Promise<unknown>,
	sent: T,
): Promise<boolean> {
	try {
		await bounded((signal) => send(sent, signal));
		flight.confirmed = sent;
		return true;
	} catch {
		if (flight.queued === null) {
			flight.shown = flight.confirmed;
			return false;
		}
		return true;
	}
}

function shownValue<T>(map: Map<string, Flight<T>>, key: string, loaded: T): T {
	const flight = map.get(key);
	if (!flight) {
		return loaded;
	}
	if (flight.sending || flight.queued !== null) {
		return flight.shown;
	}
	if (loaded !== flight.confirmed && loaded === flight.baseline) {
		return flight.confirmed;
	}
	map.delete(key);
	return loaded;
}

function notify(): void {
	version += 1;
	for (const listener of listeners) {
		listener();
	}
}

export function bounded<T>(runWork: (signal: AbortSignal) => Promise<T>): Promise<T> {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			reject(new DOMException("The operation was aborted.", "AbortError"));
		}, PENDING_TASK_WINDOW_MS);
	});
	const work = Promise.resolve().then(() => runWork(controller.signal));
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
