import { useSyncExternalStore } from "react";

import { resetAgentAccountState } from "#/screens/agent-detail/account-reset.ts";
import { clearOverviewHold } from "#/screens/overview/load.ts";
import { type RulesLimitValue, type RulesRule, type RulesWrite, setRuleEnabled, setRuleLimit } from "#/server/rules.ts";
import { bounded } from "#/workspace/bounded.ts";
import { clearFrameHold, onFrameAccountReset } from "#/workspace/frame-load.ts";
import { settleWrite } from "#/workspace/write-result.ts";
import { confirmRetired, nextWriteFence } from "#/write-fence.ts";

interface Flight<T> {
	shown: T;
	sending: boolean;
	queued: T | null;
}

const ruleFlights = new Map<string, Flight<boolean>>();
const limitFlights = new Map<string, Flight<number>>();
const listeners = new Set<() => void>();
let version = 0;
let needsRead = false;
let recoveryGeneration = 0;
let accountEpoch = 0;
let signedInUser: string | null | undefined;
const accountResets = new Set<() => void>();

onFrameAccountReset(resetTargetAccount);

export function readNeeded(): boolean {
	return needsRead;
}

export function rulesRecoveryGeneration(): number {
	if (typeof window === "undefined") return 0;
	return recoveryGeneration;
}

export function rulesAccountEpoch(): number {
	if (typeof window === "undefined") return 0;
	return accountEpoch;
}

export function onRulesAccountReset(reset: () => void): () => void {
	accountResets.add(reset);
	return () => {
		accountResets.delete(reset);
	};
}

// The id lives on the module, so a later mount still sees the previous account.
export function watchSignedInUser(userId: string | null): void {
	if (typeof window === "undefined") return;
	if (signedInUser === undefined) {
		signedInUser = userId;
		return;
	}
	if (signedInUser === userId) return;
	signedInUser = userId;
	dropAccountState();
}

// A row click and All companies change the target account without a new Clerk user.
export function resetTargetAccount(): void {
	if (typeof window === "undefined") return;
	dropAccountState();
}

function dropAccountState(): void {
	accountEpoch += 1;
	ruleFlights.clear();
	limitFlights.clear();
	writtenRules.clear();
	writtenLimits.clear();
	needsRead = false;
	recoveryGeneration = 0;
	writeCounter = 0;
	clearFrameHold();
	clearOverviewHold();
	resetAgentAccountState();
	for (const reset of accountResets) reset();
	queueMicrotask(notify);
}

export function markReadSucceeded(generation: number, epoch = accountEpoch): void {
	if (typeof window === "undefined") return;
	if (epoch !== accountEpoch) return;
	if (generation >= recoveryGeneration) needsRead = false;
}

export function markReadFailed(epoch = accountEpoch): void {
	if (typeof window === "undefined") return;
	if (epoch !== accountEpoch) return;
	recoveryGeneration += 1;
	needsRead = true;
}

function sameAccount(epoch: number): boolean {
	return typeof window === "undefined" || epoch === accountEpoch;
}

export async function readIfNeeded(refresh: () => Promise<void>): Promise<void> {
	if (!needsRead) return;
	await bounded(() => refresh()).catch(() => undefined);
}

let writeCounter = 0;
const writtenRules = new Map<string, { row: RulesRule; stamp: number }>();
const writtenLimits = new Map<string, { row: RulesLimitValue; stamp: number }>();

export function rulesWriteCounter(): number {
	if (typeof window === "undefined") return 0;
	return writeCounter;
}

export function noteUncertainWrite(epoch = accountEpoch): void {
	if (!sameAccount(epoch)) return;
	writeCounter += 1;
}

export function rulesWrittenSince(counter: number) {
	return {
		rules: [...writtenRules.values()].filter(({ stamp }) => stamp > counter).map(({ row }) => row),
		limits: [...writtenLimits.values()].filter(({ stamp }) => stamp > counter).map(({ row }) => row),
	};
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

export function queueRule(id: string, next: boolean, accountId: string, refresh: () => Promise<void>): void {
	const flight = queueValue(ruleFlights, id, next);
	if (!flight) {
		return;
	}
	void run(ruleFlights, id, flight, (value, signal) => sendRule(id, value, accountId, signal), refresh);
}

export function queueLimit(key: string, next: number, accountId: string, refresh: () => Promise<void>): void {
	const flight = queueValue(limitFlights, key, next);
	if (!flight) {
		return;
	}
	void run(limitFlights, key, flight, (value, signal) => sendLimit(key, value, accountId, signal), refresh);
}

export function placeRule(rule: RulesRule): void {
	writeCounter += 1;
	writtenRules.set(rule.id, { row: rule, stamp: writeCounter });
	notify();
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

async function sentOrHeld<T>(
	send: (value: T, signal: AbortSignal) => Promise<T | null>,
	sent: T,
): Promise<{ readonly value: T | null; readonly left: boolean }> {
	const settled = await settleWrite(() => bounded((signal) => send(sent, signal)));
	if (!settled.ok) return { value: null, left: settled.left };
	return { value: settled.value, left: false };
}

async function sendRule(id: string, value: boolean, accountId: string, signal: AbortSignal): Promise<boolean | null> {
	const epoch = accountEpoch;
	const fence = nextWriteFence();
	const body = await setRuleEnabled({
		data: { accountId, id, on: value, tab: fence.tab, seq: fence.seq, retires: fence.retires },
		signal,
	});
	const row = acceptedRule(body, id);
	// A validation error is a 200 with an error payload. The server wrote nothing.
	if (row) confirmRetired(fence.retires);
	if (!sameAccount(epoch) || signal.aborted || !row) {
		return null;
	}
	placeRule(row);
	return row.on;
}

async function sendLimit(key: string, value: number, accountId: string, signal: AbortSignal): Promise<number | null> {
	const epoch = accountEpoch;
	const fence = nextWriteFence();
	const body = await setRuleLimit({
		data: { accountId, key, value, tab: fence.tab, seq: fence.seq, retires: fence.retires },
		signal,
	});
	const row = acceptedLimit(body, key);
	// A validation error is a 200 with an error payload. The server wrote nothing.
	if (row) confirmRetired(fence.retires);
	if (!sameAccount(epoch) || signal.aborted || !row) {
		return null;
	}
	writeCounter += 1;
	writtenLimits.set(row.key, { row, stamp: writeCounter });
	notify();
	return row.value;
}

async function run<T>(
	map: Map<string, Flight<T>>,
	key: string,
	flight: Flight<T>,
	send: (value: T, signal: AbortSignal) => Promise<T | null>,
	refresh: () => Promise<void>,
): Promise<void> {
	const epoch = accountEpoch;
	while (map.get(key) === flight) {
		const sent = flight.queued ?? flight.shown;
		flight.queued = null;
		flight.sending = true;
		notify();
		const held = await sentOrHeld(send, sent);
		if (!sameAccount(epoch)) return;
		if (held.left) {
			map.delete(key);
			notify();
			return;
		}
		const returned = held.value;
		if (returned === null) {
			noteUncertainWrite(epoch);
			markReadFailed(epoch);
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

function acceptedRule(body: RulesWrite<RulesRule> | null, id: string): RulesRule | null {
	if (!isWrite(body) || !isRulesRule(body.row) || body.row.id !== id) return null;
	return body.row;
}

function acceptedLimit(body: RulesWrite<RulesLimitValue> | null, key: string): RulesLimitValue | null {
	if (!isWrite(body) || !isLimitValue(body.row) || body.row.key !== key) return null;
	return body.row;
}

function isWrite(value: unknown): value is RulesWrite<unknown> {
	return isRecord(value) && (value.status === "written" || value.status === "superseded");
}

function isLimitValue(value: unknown): value is RulesLimitValue {
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

export { bounded };
