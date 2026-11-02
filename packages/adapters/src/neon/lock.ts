import { sql } from "drizzle-orm";

import type { AppDatabase } from "./postgres.ts";

type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

// The migration takes this lock. A test reset waits for it, so the two cannot deadlock.
const workspaceLock = sql`SELECT pg_advisory_xact_lock(1952804467, 1)`;

export async function workspaceTransaction<T>(db: AppDatabase, run: (tx: Tx) => Promise<T>): Promise<T> {
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			return await db.transaction(async (tx) => {
				await tx.execute(workspaceLock);
				return await run(tx);
			});
		} catch (error) {
			if (attempt === 3 || !isDeadlock(error)) {
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
