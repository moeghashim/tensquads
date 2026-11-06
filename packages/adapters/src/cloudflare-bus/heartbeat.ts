import { chooseAdapters } from "../adapter-choice.ts";
import { type AlarmStorage, clearDeadline, deadlineToken, HEARTBEAT_ALARM, setDeadline } from "./alarm.ts";

export { HEARTBEAT_ALARM };

export const MISSED_MS = 180_000;
export const RETRY_MS = 60_000;
export const HEARTBEATS = "heartbeats";

interface HeartbeatBeat {
	readonly at: number;
	readonly resumedAt?: number;
}

export type HeartbeatStorage = AlarmStorage;

export interface HeartbeatEnv {
	readonly ADAPTERS?: string;
	readonly now?: () => number;
	readonly resumeAgent?: (accountId: string, agentId: string) => Promise<void>;
	readonly BOAT_TOKEN?: string;
	readonly BOAT_ADMIN_TOKEN?: string;
	readonly BOAT_PROFILE?: string;
	readonly BOAT_BASE_PATH?: string;
	readonly BOAT_SECRET_BASE_URL?: string;
	readonly fetchApi?: typeof fetch;
}

type Resume = (accountId: string, agentId: string) => Promise<void>;

function earlier(current: number | null, due: number): number {
	return current === null ? due : Math.min(current, due);
}

async function arm(storage: HeartbeatStorage, due: number, _now: number): Promise<void> {
	await setDeadline(storage, HEARTBEAT_ALARM, due);
}

export async function recordBeat(storage: HeartbeatStorage, agentId: string, at: number): Promise<void> {
	const map = (await storage.get<Record<string, HeartbeatBeat>>(HEARTBEATS)) ?? {};
	map[agentId] = { at };
	await storage.put(HEARTBEATS, map);
	const due = earliestDue(map);
	if (due !== null) await arm(storage, due, at);
}

function earliestDue(map: Readonly<Record<string, HeartbeatBeat>>): number | null {
	let next: number | null = null;
	for (const beat of Object.values(map)) {
		const due = dueOf(beat);
		if (due !== null) next = earlier(next, due);
	}
	return next;
}

function resumeFor(env: HeartbeatEnv): Resume | undefined {
	if (env.resumeAgent) return env.resumeAgent;
	if (chooseAdapters(env.ADAPTERS) !== "real") return undefined;
	return (accountId, agentId) => resumeLive(env, accountId, agentId);
}

async function resumeLive(env: HeartbeatEnv, accountId: string, agentId: string): Promise<void> {
	const { createBoatMachine } = await import("../boat-machine.ts");
	const machine = createBoatMachine({
		token: env.BOAT_TOKEN ?? "",
		adminToken: env.BOAT_ADMIN_TOKEN,
		profileName: env.BOAT_PROFILE ?? "",
		basePath: env.BOAT_BASE_PATH,
		secretBaseUrl: env.BOAT_SECRET_BASE_URL,
		fetchApi: env.fetchApi,
	});
	await machine.resume({ accountId, mode: "account" }, agentId);
}

function dueOf(beat: HeartbeatBeat): number | null {
	if (beat.resumedAt !== undefined) return null;
	return beat.at + MISSED_MS;
}

async function resumeDue(
	resume: Resume,
	accountId: string,
	agentId: string,
	beat: HeartbeatBeat,
	map: Record<string, HeartbeatBeat>,
	now: number,
	clock: () => number,
): Promise<number | null> {
	try {
		await resume(accountId, agentId);
		map[agentId] = { at: beat.at, resumedAt: now };
		return null;
	} catch {
		// The retry counts from when the resume finished, not from the sweep start.
		return clock() + RETRY_MS;
	}
}

async function oneDue(
	map: Record<string, HeartbeatBeat>,
	agentId: string,
	now: number,
	resume: Resume | undefined,
	accountId: string | undefined,
	clock: () => number,
): Promise<number | null> {
	const beat = map[agentId];
	if (!beat) return null;
	const due = dueOf(beat);
	if (due === null) return null;
	if (now < due) return due;
	if (!resume || !accountId) return null;
	return resumeDue(resume, accountId, agentId, beat, map, now, clock);
}

// A beat that arrived while this alarm waited in the queue counts from its
// arrival time, not from the older stored beat.
function effectiveBeats(
	stored: Record<string, HeartbeatBeat>,
	arrivals?: ReadonlyMap<string, number>,
): Record<string, HeartbeatBeat> {
	const map: Record<string, HeartbeatBeat> = { ...stored };
	if (!arrivals) return map;
	for (const [agentId, at] of arrivals) {
		const beat = map[agentId];
		if (!beat || at > beat.at) map[agentId] = { at };
	}
	return map;
}

// A beat can land during the resume I/O. Keep the newer beat for each agent.
function mergeBeats(
	latest: Record<string, HeartbeatBeat>,
	ours: Record<string, HeartbeatBeat>,
	agentIds: readonly string[],
): Record<string, HeartbeatBeat> {
	const merged: Record<string, HeartbeatBeat> = { ...latest };
	for (const agentId of agentIds) {
		const ourBeat = ours[agentId];
		const theirBeat = merged[agentId];
		if (ourBeat && (!theirBeat || theirBeat.at <= ourBeat.at)) merged[agentId] = ourBeat;
	}
	return merged;
}

export async function sweepHeartbeats(
	storage: HeartbeatStorage,
	env: HeartbeatEnv,
	arrivals?: ReadonlyMap<string, number>,
): Promise<void> {
	const token = await deadlineToken(storage, HEARTBEAT_ALARM);
	const clock = () => env.now?.() ?? Date.now();
	const now = clock();
	const stored = (await storage.get<Record<string, HeartbeatBeat>>(HEARTBEATS)) ?? {};
	const map = effectiveBeats(stored, arrivals);
	const agentIds = Object.keys(map);
	if (agentIds.length === 0) {
		await clearDeadline(storage, HEARTBEAT_ALARM, token);
		return;
	}
	const resume = resumeFor(env);
	const accountId = await storage.get<string>("account");
	let nextDue: number | null = null;
	for (const agentId of agentIds) {
		const due = await oneDue(map, agentId, now, resume, accountId, clock);
		if (due !== null) nextDue = earlier(nextDue, due);
	}
	const latest = (await storage.get<Record<string, HeartbeatBeat>>(HEARTBEATS)) ?? {};
	await storage.put(HEARTBEATS, mergeBeats(latest, map, agentIds));
	if (nextDue === null) {
		await clearDeadline(storage, HEARTBEAT_ALARM, token);
		return;
	}
	await arm(storage, nextDue, now);
}

export { alarmAfterFlush } from "./alarm.ts";
