import type { BusKind } from "@tensquads/domain";
import { eq } from "drizzle-orm";

import { insertBusEvent, refuseDirectBusWrite, upsertStateValue } from "../../cloudflare-bus/neon-write.ts";
import { traceFor } from "../../trace.ts";
import type { AppDatabase } from "../postgres.ts";
import { busCursors } from "../schema.ts";

const CURSOR_SEQ = 100;
const CURSOR_CLOCK = 11 * 60 + 2;

export interface EventDraft {
	readonly from: string;
	readonly to: string;
	readonly kind: BusKind;
	readonly skill: string;
	readonly text: string;
	readonly payload: Readonly<Record<string, unknown>>;
	readonly writes?: readonly string[];
	readonly set?: Readonly<Record<string, unknown>>;
}

export interface StampedEvent {
	readonly id: string;
	readonly time: string;
	readonly trace: string;
}

export interface BusCursor {
	readonly seq: number;
	readonly clock: number;
	readonly scriptIndex: number;
}

type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

function clockText(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export async function lockCursor(tx: Tx, accountId: string): Promise<BusCursor> {
	await tx
		.insert(busCursors)
		.values({ accountId, seq: CURSOR_SEQ, clock: CURSOR_CLOCK, scriptIndex: 0 })
		.onConflictDoNothing();
	const rows = await tx.select().from(busCursors).where(eq(busCursors.accountId, accountId)).for("update");
	const row = rows[0];
	if (!row) {
		throw new Error("The bus cursor is missing.");
	}
	return { seq: row.seq, clock: row.clock, scriptIndex: row.scriptIndex };
}

export async function saveCursor(tx: Tx, accountId: string, cursor: BusCursor): Promise<void> {
	await tx
		.update(busCursors)
		.set({ seq: cursor.seq, clock: cursor.clock, scriptIndex: cursor.scriptIndex })
		.where(eq(busCursors.accountId, accountId));
}

export async function appendEvents(
	tx: Tx,
	accountId: string,
	drafts: readonly EventDraft[],
	occurredAt: Date,
): Promise<readonly StampedEvent[]> {
	refuseDirectBusWrite();
	const cursor = await lockCursor(tx, accountId);
	if (drafts.length === 0) {
		return [];
	}
	const clock = cursor.clock + 1;
	const time = clockText(clock);
	let seq = cursor.seq;
	const stamped: StampedEvent[] = [];
	for (const draft of drafts) {
		const id = `e${seq}`;
		const trace = traceFor(id);
		await insertBusEvent(tx, {
			accountId,
			id,
			timeText: time,
			occurredAt,
			fromAgent: draft.from,
			toAgent: draft.to,
			kind: draft.kind,
			skill: draft.skill,
			body: draft.text,
			payload: { ...draft.payload },
			writes: [...(draft.writes ?? [])],
			trace,
			seq,
		});
		await applySet(tx, accountId, draft.set, seq);
		stamped.push({ id, time, trace });
		seq += 1;
	}
	await saveCursor(tx, accountId, { seq, clock, scriptIndex: cursor.scriptIndex });
	return stamped;
}

async function applySet(
	tx: Tx,
	accountId: string,
	values: Readonly<Record<string, unknown>> | undefined,
	seq: number,
): Promise<void> {
	if (!values) {
		return;
	}
	for (const [key, value] of Object.entries(values)) {
		await upsertStateValue(tx, { accountId, key, value: JSON.stringify(value), sortOrder: seq });
	}
}
