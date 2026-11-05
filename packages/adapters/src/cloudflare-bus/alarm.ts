// One alarm serves the bus, the heartbeats and the delivery retry.
// Each user stores its deadline. The alarm is always the earliest stored one.

export const DELIVERY_ALARM = "delivery-alarm";

export interface AlarmStorage {
	get<T>(key: string): Promise<T | undefined>;
	put<T>(key: string, value: T): Promise<void>;
	delete(key: string): Promise<boolean>;
	getAlarm(): Promise<number | null>;
	setAlarm(scheduledTime: number | Date): Promise<void>;
	deleteAlarm(): Promise<void>;
}

type KvStorage = Pick<AlarmStorage, "get" | "put">;

async function storedDue(storage: KvStorage, key: string): Promise<number | null> {
	const value = await storage.get<number>(key);
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const HEARTBEAT_ALARM = "heartbeat-alarm";

async function earliestAlarmDue(storage: KvStorage, extra?: number | null): Promise<number | null> {
	let next: number | null = extra ?? null;
	for (const key of [HEARTBEAT_ALARM, DELIVERY_ALARM]) {
		const due = await storedDue(storage, key);
		if (due !== null && (next === null || due < next)) next = due;
	}
	return next;
}

export function alarmAfterFlush(
	remaining: number,
	heartbeatDue: unknown,
	now: number,
	alarmMs: number,
	deliveryDue?: unknown,
): number | null {
	let next: number | null = null;
	if (remaining > 0) next = now + alarmMs;
	else if (typeof heartbeatDue === "number" && Number.isFinite(heartbeatDue)) next = heartbeatDue;
	if (typeof deliveryDue === "number" && Number.isFinite(deliveryDue)) {
		next = next === null ? deliveryDue : Math.min(next, deliveryDue);
	}
	return next;
}

// After a bus flush, the next alarm is the earliest of the bus, heartbeat and delivery deadlines.
export async function flushAlarmDue(
	storage: KvStorage,
	remaining: number,
	now: number,
	alarmMs: number,
): Promise<number | null> {
	return alarmAfterFlush(
		remaining,
		await storedDue(storage, HEARTBEAT_ALARM),
		now,
		alarmMs,
		await storedDue(storage, DELIVERY_ALARM),
	);
}

export async function applyAlarm(storage: AlarmStorage, extra?: number | null): Promise<void> {
	const next = await earliestAlarmDue(storage, extra);
	if (next === null) await storage.deleteAlarm();
	else await storage.setAlarm(next);
}

export async function armStoredAlarm(storage: AlarmStorage, key: string, due: number): Promise<void> {
	await storage.put(key, due);
	await applyAlarm(storage);
}

export async function clearStoredAlarm(storage: AlarmStorage, key: string): Promise<void> {
	await storage.delete(key);
	await applyAlarm(storage);
}
