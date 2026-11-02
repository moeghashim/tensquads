import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";
import { useSyncExternalStore } from "react";

import { type RulesRule, setRuleEnabled, setRuleLimit } from "#/server/rules.ts";

interface Flight<T> {
	shown: T;
	sending: boolean;
	queued: T | null;
}

interface LimitValue {
	readonly key: string;
	readonly value: number;
}

const ruleFlights = new Map<string, Flight<boolean>>();
const limitFlights = new Map<string, Flight<number>>();
const listeners = new Set<() => void>();
let version = 0;
let needsRead = false;

export function readNeeded(): boolean {
	return needsRead;
}

export function markReadSucceeded(): void {
	needsRead = false;
}

export function markReadFailed(): void {
	needsRead = true;
}

export async function readIfNeeded(refresh: () => Promise<void>): Promise<void> {
	if (!needsRead) return;
	await bounded(() => refresh()).catch(() => undefined);
}

let replaceRule = (_rule: RulesRule): void => undefined;
let replaceLimit = (_row: LimitValue): void => undefined;

export function bindRuleWrites(apply: {
	readonly rule: (rule: RulesRule) => void;
	readonly limit: (row: LimitValue) => void;
}): void {
	replaceRule = apply.rule;
	replaceLimit = apply.limit;
}

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

export function queueRule(id: string, next: boolean, refresh: () => Promise<void>): void {
	const flight = queueValue(ruleFlights, id, next);
	if (!flight) {
		return;
	}
	void run(ruleFlights, id, flight, (value, signal) => sendRule(id, value, signal), refresh);
}

export function queueLimit(key: string, next: number, refresh: () => Promise<void>): void {
	const flight = queueValue(limitFlights, key, next);
	if (!flight) {
		return;
	}
	void run(limitFlights, key, flight, (value, signal) => sendLimit(key, value, signal), refresh);
}

export function placeRule(rule: RulesRule): void {
	replaceRule(rule);
}

export function isRulesRule(value: unknown): value is RulesRule {
	if (!isRecord(value)) {
		return false;
	}
	return (
		typeof value.id === "string" &&
		value.id.length > 0 &&
		typeof value.when === "string" &&
		typeof value.agent === "string" &&
		typeof value.action === "string" &&
		typeof value.approval === "string" &&
		typeof value.on === "boolean"
	);
}

function queueValue<T>(map: Map<string, Flight<T>>, key: string, next: T): Flight<T> | null {
	const flight = map.get(key);
	if (!flight) {
		const created = { shown: next, sending: false, queued: null };
		map.set(key, created);
		return created;
	}
	flight.shown = next;
	flight.queued = next;
	notify();
	return null;
}

async function sendRule(id: string, value: boolean, signal: AbortSignal): Promise<boolean | null> {
	const row = await setRuleEnabled({ data: { id, on: value }, signal });
	if (signal.aborted || !isRulesRule(row) || row.id !== id) {
		return null;
	}
	replaceRule(row);
	return row.on;
}

async function sendLimit(key: string, value: number, signal: AbortSignal): Promise<number | null> {
	const row = await setRuleLimit({ data: { key, value }, signal });
	if (signal.aborted || !isLimitValue(row) || row.key !== key) {
		return null;
	}
	replaceLimit(row);
	return row.value;
}

async function run<T>(
	map: Map<string, Flight<T>>,
	key: string,
	flight: Flight<T>,
	send: (value: T, signal: AbortSignal) => Promise<T | null>,
	refresh: () => Promise<void>,
): Promise<void> {
	while (map.get(key) === flight) {
		const sent = flight.queued ?? flight.shown;
		flight.queued = null;
		flight.sending = true;
		notify();
		let returned: T | null = null;
		try {
			returned = await bounded((signal) => send(sent, signal));
		} catch {
			returned = null;
		}
		if (returned === null) {
			const newer = takeNewer(flight, sent);
			if (newer) {
				continue;
			}
			map.delete(key);
			notify();
			await bounded(() => refresh()).catch(() => undefined);
			return;
		}
		const newer = takeNewer(flight, returned);
		if (!newer) {
			map.delete(key);
			notify();
			await readIfNeeded(refresh);
			return;
		}
	}
}

function takeNewer<T>(flight: Flight<T>, sent: T): boolean {
	const newer = flight.queued;
	flight.queued = null;
	if (newer === null || newer === sent) {
		flight.sending = false;
		return false;
	}
	flight.shown = newer;
	notify();
	return true;
}

function shownValue<T>(map: Map<string, Flight<T>>, key: string, loaded: T): T {
	const flight = map.get(key);
	if (!flight) {
		return loaded;
	}
	if (flight.sending || flight.queued !== null) {
		return flight.shown;
	}
	map.delete(key);
	return loaded;
}

function isLimitValue(value: unknown): value is LimitValue {
	return isRecord(value) && typeof value.key === "string" && value.key.length > 0 && typeof value.value === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
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
