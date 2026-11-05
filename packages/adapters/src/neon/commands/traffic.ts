import { type AccountScope, type BusEvent, type BusKind, requireScope } from "@tensquads/domain";
import { asc, eq } from "drizzle-orm";
import { createMemoryBus } from "../../memory-bus.ts";
import { PENDING_TASK_WINDOW_MS } from "../../pending-window.ts";
import { traceFor } from "../../trace.ts";
import { trafficScript } from "../../traffic-script.ts";
import { workspaceTransaction } from "../lock.ts";
import type { AppDatabase } from "../postgres.ts";
import { busEvents, stateEntries } from "../schema.ts";
import { appendEvents, type EventDraft, lockCursor, saveCursor } from "./bus.ts";

type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

const busKinds = ["Task", "Result", "Request", "Relay", "Escalation", "Approval", "Declined"] as const;

function knownKind(kind: string): BusKind {
	for (const candidate of busKinds) {
		if (candidate === kind) return candidate;
	}
	throw new Error(`The script kind ${kind} is not a bus kind.`);
}

function asKind(value: string): BusKind {
	return knownKind(value);
}

async function readEvents(tx: Tx, accountId: string): Promise<BusEvent[]> {
	const rows = await tx.select().from(busEvents).where(eq(busEvents.accountId, accountId)).orderBy(asc(busEvents.seq));
	return rows.map((row) => ({
		id: row.id,
		time: row.timeText,
		from: row.fromAgent,
		to: row.toAgent,
		kind: asKind(row.kind),
		skill: row.skill,
		text: row.body,
		payload: row.payload,
		writes: row.writes,
		trace: row.trace,
	}));
}

async function readStore(tx: Tx, accountId: string): Promise<Record<string, unknown>> {
	const rows = await tx
		.select()
		.from(stateEntries)
		.where(eq(stateEntries.accountId, accountId))
		.orderBy(asc(stateEntries.sortOrder));
	const store: Record<string, unknown> = {};
	for (const row of rows) store[row.key] = JSON.parse(row.value) as unknown;
	return store;
}

function draftFrom(event: BusEvent): EventDraft {
	return {
		from: event.from,
		to: event.to,
		kind: event.kind,
		skill: event.skill,
		text: event.text,
		payload: event.payload,
		writes: event.writes,
		set: event.set,
	};
}

async function writeNextEvent(tx: Tx, accountId: string): Promise<BusEvent | undefined> {
	const cursor = await lockCursor(tx, accountId);
	const events = await readEvents(tx, accountId);
	const store = await readStore(tx, accountId);
	const memory = createMemoryBus({ events, store, script: trafficScript(), cursor, trace: traceFor });
	const event = memory.nextEvent();
	if (!event) return undefined;
	// appendEvents saves the script index it read. Save the advanced index after that write.
	const [saved] = await appendEvents(tx, accountId, [draftFrom(event)], new Date());
	await saveCursor(tx, accountId, memory.cursor());
	if (!saved) return undefined;
	return {
		id: saved.id,
		time: saved.time,
		from: event.from,
		to: event.to,
		kind: event.kind,
		skill: event.skill,
		text: event.text,
		payload: event.payload,
		writes: event.writes,
		trace: saved.trace,
		...(event.set === undefined ? {} : { set: event.set }),
	};
}

const unfinished = "The workspace write did not finish.";

export async function nextEvent(
	db: AppDatabase,
	scope: AccountScope,
	deadlineAt?: number,
): Promise<BusEvent | undefined> {
	const checked = requireScope(scope);
	if (checked.mode !== "account") return undefined;
	const absolute = deadlineAt ?? Date.now() + PENDING_TASK_WINDOW_MS;
	const remaining = absolute - Date.now();
	// A lock_timeout of 0 waits forever, so a few milliseconds left is already late.
	if (remaining < 4) throw new Error(unfinished);
	let created: BusEvent | undefined;
	await workspaceTransaction(
		db,
		async (tx, constrainDeadline) => {
			constrainDeadline(absolute);
			created = await writeNextEvent(tx, checked.accountId);
		},
		{ deadlineMs: remaining, accountId: checked.accountId },
	);
	return created;
}
