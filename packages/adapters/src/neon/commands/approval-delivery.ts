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
