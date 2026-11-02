import { sql } from "drizzle-orm";

import type { AppDatabase } from "./postgres.ts";

type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

// The migration takes this lock. A test reset waits for it, so the two cannot deadlock.
const workspaceLock = sql`SELECT pg_advisory_xact_lock(1952804467, 1)`;

const sendAttempts = 3;
const unfinished = "The workspace write did not finish.";

export interface WorkspaceTransactionOptions {
	readonly deadlineMs: number;
}

interface SendBound {
	deadline: number;
	readonly attemptMs: number;
}

type WorkspaceWork<T> = (tx: Tx, constrainDeadline: (deadline: number) => void) => Promise<T>;

export async function workspaceTransaction<T>(
	db: AppDatabase,
	run: WorkspaceWork<T>,
	options?: WorkspaceTransactionOptions,
): Promise<T> {
	const bound = sendBound(options);
	for (let attempt = 1; attempt <= sendAttempts; attempt++) {
		const finished = await tryAttempt(db, run, bound, attempt);
		if (finished) {
			return finished.value;
		}
	}
	throw new Error(unfinished);
}

function sendBound(options: WorkspaceTransactionOptions | undefined): SendBound | undefined {
	if (!options) {
		return undefined;
	}
	return {
		deadline: Date.now() + options.deadlineMs,
		attemptMs: Math.floor((options.deadlineMs - 1) / sendAttempts),
	};
}

// The deadline starts once, with the first attempt, and every retry shares it.
function retryFits(bound: SendBound | undefined, attempt: number): boolean {
	if (attempt === 1) {
		return true;
	}
	if (!bound) {
		return true;
	}
	return bound.deadline - Date.now() >= bound.attemptMs;
}

async function tryAttempt<T>(
	db: AppDatabase,
	run: WorkspaceWork<T>,
	bound: SendBound | undefined,
	attempt: number,
): Promise<{ readonly value: T } | undefined> {
	if (!retryFits(bound, attempt)) {
		throw new Error(unfinished);
	}
	try {
		return { value: await runAttempt(db, run, bound) };
	} catch (error) {
		rethrowUnlessRetry(error, attempt);
		return undefined;
	}
}

function rethrowUnlessRetry(error: unknown, attempt: number): void {
	if (attempt === sendAttempts) {
		throw error;
	}
	if (!isDeadlock(error)) {
		throw error;
	}
}

async function runAttempt<T>(db: AppDatabase, run: WorkspaceWork<T>, bound: SendBound | undefined): Promise<T> {
	return db.transaction(async (tx) => {
		await armSend(tx, bound);
		await tx.execute(workspaceLock);
		const value = await run(tx, (deadline) => {
			if (bound) bound.deadline = Math.min(bound.deadline, deadline);
		});
		// Last step before commit. A late send throws, so all its writes roll back.
		assertBeforeDeadline(bound);
		return value;
	});
}

async function armSend(tx: Tx, bound: SendBound | undefined): Promise<void> {
	if (!bound) {
		return;
	}
	await tx.execute(sql.raw(`SET LOCAL lock_timeout = '${bound.attemptMs}ms'`));
	await tx.execute(sql.raw(`SET LOCAL statement_timeout = '${bound.attemptMs}ms'`));
}

function assertBeforeDeadline(bound: SendBound | undefined): void {
	if (!bound) {
		return;
	}
	if (Date.now() >= bound.deadline) {
		throw new Error(unfinished);
	}
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
