import { and, asc, eq } from "drizzle-orm";

import type { AppDatabase } from "../postgres.ts";
import { approvalDeliveries } from "../schema.ts";
import type { DeliverUserEvent, UserMasterEvent } from "./approval-bus.ts";

type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

export async function recordDelivery(
	tx: Tx,
	accountId: string,
	approvalId: string,
	event: UserMasterEvent,
): Promise<void> {
	await tx
		.insert(approvalDeliveries)
		.values({ accountId, approvalId, event: { ...event } })
		.onConflictDoNothing();
}

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 60_000;

// The alarm waits this long before it tries a pending delivery again.
export function deliveryBackoffMs(attempt: number): number {
	const step = Math.max(0, Math.floor(attempt));
	return Math.min(BACKOFF_BASE_MS * 2 ** step, BACKOFF_CAP_MS);
}

// A sweep waits this long before it retries a row on its own.
export const DELIVERY_GRACE_MS = 60_000;

// The alarm calls this. It sends each pending row with its stored event id.
// A row is deleted only after its send succeeds. It returns the rows left.
// With beforeMs, only rows whose event time is at or before it are sent.
export async function retryApprovalDeliveries(
	db: AppDatabase,
	accountId: string,
	deliver: DeliverUserEvent,
	beforeMs?: number,
): Promise<number> {
	const stored = await db
		.select()
		.from(approvalDeliveries)
		.where(eq(approvalDeliveries.accountId, accountId))
		.orderBy(asc(approvalDeliveries.approvalId));
	const rows = beforeMs === undefined ? stored : stored.filter((row) => eventMs(row.event) <= beforeMs);
	let remaining = 0;
	for (const row of rows) {
		try {
			await deliver(accountId, row.event);
		} catch {
			remaining += 1;
			continue;
		}
		await db
			.delete(approvalDeliveries)
			.where(and(eq(approvalDeliveries.accountId, accountId), eq(approvalDeliveries.approvalId, row.approvalId)));
	}
	return remaining;
}

function eventMs(event: UserMasterEvent): number {
	const parsed = Date.parse(event.time);
	return Number.isFinite(parsed) ? parsed : 0;
}

export async function flushDeliveries(db: AppDatabase, accountId: string, deliver: DeliverUserEvent): Promise<void> {
	const rows = await db
		.select()
		.from(approvalDeliveries)
		.where(eq(approvalDeliveries.accountId, accountId))
		.orderBy(asc(approvalDeliveries.approvalId));
	for (const row of rows) {
		await deliver(accountId, row.event);
		await db
			.delete(approvalDeliveries)
			.where(and(eq(approvalDeliveries.accountId, accountId), eq(approvalDeliveries.approvalId, row.approvalId)));
	}
}
