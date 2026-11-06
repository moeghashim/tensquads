// One alarm serves the bus, the heartbeats and the delivery retry.
// Each user stores its own deadline key. Only rearm sets or deletes the alarm.
// It sets the earliest stored deadline, or deletes the alarm when none exist.
// Each deadline has a generation token. A clear after external I/O succeeds
// only when that token is unchanged. A new schedule bumps the token.

export const BUS_ALARM = "bus-alarm";
export const HEARTBEAT_ALARM = "heartbeat-alarm";
export const DELIVERY_ALARM = "delivery-alarm";

const KEYS = [BUS_ALARM, HEARTBEAT_ALARM, DELIVERY_ALARM] as const;
const OPEN_PREFIX = "master-open:";

export interface AlarmKv {
	get<T>(key: string): T | undefined;
	put<T>(key: string, value: T): void;
	delete(key: string): boolean;
	list<T>(options?: { prefix?: string }): Iterable<[string, T]>;
}

export interface AlarmStorage {
	get<T>(key: string, options?: { noCache?: boolean }): Promise<T | undefined>;
	put<T>(key: string, value: T): Promise<void>;
	delete(key: string): Promise<boolean>;
	getAlarm(): Promise<number | null>;
	setAlarm(scheduledTime: number | Date): Promise<void>;
	deleteAlarm(): Promise<void>;
	transactionSync<T>(closure: () => T): T;
	readonly kv: AlarmKv;
}

type KvStorage = Pick<AlarmStorage, "get">;

function tokenKey(key: string): string {
	return `${key}.token`;
}

function finite(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function storedDue(storage: KvStorage, key: string): Promise<number | null> {
	return finite(await storage.get<number>(key, { noCache: true }));
}

export async function deadlineToken(storage: AlarmStorage, key: string): Promise<number> {
	const value = storage.transactionSync(() => storage.kv.get<number>(tokenKey(key)));
	return finite(value) ?? 0;
}

export async function rearm(storage: AlarmStorage): Promise<void> {
	let next: number | null = null;
	for (const key of KEYS) {
		const due = await storedDue(storage, key);
		if (due !== null && (next === null || due < next)) next = due;
	}
	if (next === null) await storage.deleteAlarm();
	else await storage.setAlarm(next);
}

export async function setDeadline(storage: AlarmStorage, key: string, due: number): Promise<number> {
	const token = storage.transactionSync(() => {
		const next = (finite(storage.kv.get<number>(tokenKey(key))) ?? 0) + 1;
		storage.kv.put(tokenKey(key), next);
		storage.kv.put(key, due);
		return next;
	});
	await rearm(storage);
	return token;
}

// A passed token must still be the stored one. The check and the delete are one
// synchronous transaction, so a schedule that arrived during external I/O stays.
export async function clearDeadline(storage: AlarmStorage, key: string, token?: number): Promise<boolean> {
	const cleared = storage.transactionSync(() => {
		if (token !== undefined && (finite(storage.kv.get<number>(tokenKey(key))) ?? 0) !== token) return false;
		// Only the deadline goes. The counter stays, so tokens never repeat.
		storage.kv.delete(key);
		return true;
	});
	if (cleared) await rearm(storage);
	return cleared;
}

function deadlineIsDue(due: number | null, now: number): boolean {
	return due !== null && due <= now;
}

export async function runDue(
	storage: AlarmStorage,
	key: string,
	now: number,
	work: () => Promise<void>,
	recover: () => Promise<void>,
): Promise<void> {
	if (!deadlineIsDue(await storedDue(storage, key), now)) return;
	try {
		await work();
	} catch {
		await recover();
	}
}

// A past deadline takes the backoff from the finish time. A sooner future deadline stays.
export async function backoffDeadline(
	storage: AlarmStorage,
	key: string,
	clock: () => number,
	delay: number,
): Promise<void> {
	const now = clock();
	const current = await storedDue(storage, key);
	const proposed = now + delay;
	const due = current !== null && current > now && current < proposed ? current : proposed;
	await setDeadline(storage, key, due);
}

function busIsBusy(storage: AlarmStorage): boolean {
	return storage.transactionSync(() => {
		const pending = storage.kv.get<readonly unknown[]>("pending") ?? [];
		if (pending.length > 0) return true;
		return [...storage.kv.list({ prefix: OPEN_PREFIX })].length > 0;
	});
}

// Pending rows or an open master keep the bus key. An idle bus clears it.
export async function syncBusDeadline(
	storage: AlarmStorage,
	now: number,
	alarmMs: number,
	token?: number,
): Promise<void> {
	if (!busIsBusy(storage)) {
		await clearDeadline(storage, BUS_ALARM, token);
		return;
	}
	const current = await storedDue(storage, BUS_ALARM);
	if (current === null || current <= now) await setDeadline(storage, BUS_ALARM, now + alarmMs);
}

function dueOf(value: unknown): number | null {
	return finite(value);
}

// The earliest of the bus, heartbeat and delivery deadlines. Kept for the flush tests.
export function alarmAfterFlush(
	remaining: number,
	heartbeatDue: unknown,
	now: number,
	alarmMs: number,
	deliveryDue?: unknown,
): number | null {
	let next: number | null = remaining > 0 ? now + alarmMs : null;
	for (const due of [dueOf(heartbeatDue), dueOf(deliveryDue)]) {
		if (due !== null && (next === null || due < next)) next = due;
	}
	return next;
}
