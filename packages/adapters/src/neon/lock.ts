import { sql } from "drizzle-orm";

import { PENDING_TASK_WINDOW_MS } from "../pending-window.ts";
import type { AppDatabase } from "./postgres.ts";

type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

// The migration takes this lock. A test reset waits for it, so the two cannot deadlock.
const workspaceLock = sql`SELECT pg_advisory_xact_lock(1952804467, 1)`;

// Three deadlock attempts must end before the client abandons the send.
const sendAttempts = 3;
const sendAttemptMs = Math.floor((PENDING_TASK_WINDOW_MS - 1) / sendAttempts);
const lockTimeout = sql.raw(`SET LOCAL lock_timeout = '${sendAttemptMs}ms'`);
const statementTimeout = sql.raw(`SET LOCAL statement_timeout = '${sendAttemptMs}ms'`);

export async function workspaceTransaction<T>(db: AppDatabase, run: (tx: Tx) => Promise<T>): Promise<T> {
	for (let attempt = 1; attempt <= sendAttempts; attempt++) {
		try {
			return await db.transaction(async (tx) => {
				await tx.execute(lockTimeout);
				await tx.execute(statementTimeout);
				await tx.execute(workspaceLock);
				return await run(tx);
			});
		} catch (error) {
			if (attempt === sendAttempts || !isDeadlock(error)) {
				throw error;
			}
		}
	}
	throw new Error("The workspace write did not finish.");
}

function isDeadlock(error: unknown, depth = 0): boolean {
	if (!error || typeof error !== "object" || depth > 5) {
		return false;
	}
	const record = error as { code?: unknown; cause?: unknown };
	if (record.code === "40P01") {
		return true;
	}
	return isDeadlock(record.cause, depth + 1);
}
