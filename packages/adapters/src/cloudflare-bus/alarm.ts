// One alarm serves the bus, the heartbeats and the delivery retry.
// Each user stores its own deadline key. Only rearm sets or deletes the alarm.
// It sets the earliest stored deadline, or deletes the alarm when none exist.

export const BUS_ALARM = "bus-alarm";
export const HEARTBEAT_ALARM = "heartbeat-alarm";
export const DELIVERY_ALARM = "delivery-alarm";

const KEYS = [BUS_ALARM, HEARTBEAT_ALARM, DELIVERY_ALARM] as const;

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

export async function rearm(storage: AlarmStorage): Promise<void> {
	let next: number | null = null;
	for (const key of KEYS) {
		const due = await storedDue(storage, key);
		if (due !== null && (next === null || due < next)) next = due;
	}
	if (next === null) await storage.deleteAlarm();
	else await storage.setAlarm(next);
}

export async function setDeadline(storage: AlarmStorage, key: string, due: number): Promise<void> {
	await storage.put(key, due);
	await rearm(storage);
}

export async function clearDeadline(storage: AlarmStorage, key: string): Promise<void> {
	await storage.delete(key);
	await rearm(storage);
}

function dueOf(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
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
