import { chooseAdapters } from "../adapter-choice.ts";

export const MISSED_MS = 180_000;
export const RETRY_MS = 60_000;
export const HEARTBEATS = "heartbeats";
export const HEARTBEAT_ALARM = "heartbeat-alarm";

interface HeartbeatBeat {
	readonly at: number;
	readonly resumedAt?: number;
}

export interface HeartbeatStorage {
	get<T>(key: string): Promise<T | undefined>;
	put<T>(key: string, value: T): Promise<void>;
	getAlarm(): Promise<number | null>;
	setAlarm(scheduledTime: number | Date): Promise<void>;
	deleteAlarm(): Promise<void>;
}

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

function sooner(current: number | null, due: number, now: number): number {
	if (current === null || current <= now) return due;
	return Math.min(current, due);
}

function earlier(current: number | null, due: number): number {
	return current === null ? due : Math.min(current, due);
}

async function arm(storage: HeartbeatStorage, due: number, now: number): Promise<void> {
	await storage.put(HEARTBEAT_ALARM, due);
	const current = await storage.getAlarm();
	await storage.setAlarm(sooner(current, due, now));
}

export async function recordBeat(storage: HeartbeatStorage, agentId: string, at: number): Promise<void> {
	const map = (await storage.get<Record<string, HeartbeatBeat>>(HEARTBEATS)) ?? {};
	map[agentId] = { at };
	await storage.put(HEARTBEATS, map);
	await arm(storage, at + MISSED_MS, at);
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

function dueOf(beat: HeartbeatBeat): number {
	return (beat.resumedAt ?? beat.at) + MISSED_MS;
}

async function resumeDue(
	resume: Resume,
	accountId: string,
	agentId: string,
	beat: HeartbeatBeat,
	map: Record<string, HeartbeatBeat>,
	now: number,
): Promise<number> {
	try {
		await resume(accountId, agentId);
		map[agentId] = { at: beat.at, resumedAt: now };
		return now + MISSED_MS;
	} catch {
		return now + RETRY_MS;
	}
}

async function oneDue(
	map: Record<string, HeartbeatBeat>,
	agentId: string,
	now: number,
	resume: Resume | undefined,
	accountId: string | undefined,
): Promise<number | null> {
	const beat = map[agentId];
	if (!beat) return null;
	const due = dueOf(beat);
	if (now < due) return due;
	if (!resume || !accountId) return null;
	return resumeDue(resume, accountId, agentId, beat, map, now);
}

async function clearAlarm(storage: HeartbeatStorage, now: number): Promise<void> {
	await storage.put(HEARTBEAT_ALARM, null);
	const current = await storage.getAlarm();
	if (current === null || current <= now) await storage.deleteAlarm();
}

export async function sweepHeartbeats(storage: HeartbeatStorage, env: HeartbeatEnv): Promise<void> {
	const now = env.now?.() ?? Date.now();
	const map = (await storage.get<Record<string, HeartbeatBeat>>(HEARTBEATS)) ?? {};
	const agentIds = Object.keys(map);
	if (agentIds.length === 0) return;
	const resume = resumeFor(env);
	const accountId = await storage.get<string>("account");
	let nextDue: number | null = null;
	for (const agentId of agentIds) {
		const due = await oneDue(map, agentId, now, resume, accountId);
		if (due !== null) nextDue = earlier(nextDue, due);
	}
	await storage.put(HEARTBEATS, map);
	if (nextDue === null) {
		await clearAlarm(storage, now);
		return;
	}
	await arm(storage, nextDue, now);
}

export function alarmAfterFlush(remaining: number, heartbeatDue: unknown, now: number, alarmMs: number): number | null {
	if (remaining > 0) return now + alarmMs;
	if (typeof heartbeatDue === "number" && Number.isFinite(heartbeatDue)) return heartbeatDue;
	return null;
}
