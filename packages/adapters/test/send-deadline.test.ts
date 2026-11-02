import assert from "node:assert/strict";
import test from "node:test";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { type AppDatabase, createRepositories, schema } from "@tensquads/adapters";
import { Kernel } from "@tensquads/kernel";
import { eq } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";

import { replaceDemoAccount } from "../../seed/src/demo-account.ts";
import { migrationSql } from "../src/neon/migration-sql.ts";
import { PENDING_TASK_WINDOW_MS } from "../src/pending-window.ts";

const ads = "How did ads do this week?";
const reply = "Ad spend this week is $262 at a 3.4 return. The best ad set is Prints, lookalike.";
const statementDelayMs = 8_000;
const unfinished = "The workspace write did not finish.";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function delaysThatPassTheWindow(): number {
	return Math.floor(PENDING_TASK_WINDOW_MS / statementDelayMs) + 1;
}

function delayStatements(
	client: PGlite,
	count: number,
	eachMs: number,
	afterQuery?: string,
): { delayed: () => number; restore: () => void } {
	const original = client.transaction;
	let left = count;
	let taken = 0;
	let ready = afterQuery === undefined;
	const patched = (async (callback) => {
		return original.call(client, async (tx) => {
			const query = tx.query.bind(tx);
			tx.query = (async (text, params, options) => {
				if (ready && left > 0) {
					left -= 1;
					taken += 1;
					await delay(eachMs);
				}
				if (afterQuery && text.includes(afterQuery)) ready = true;
				return query(text, params, options);
			}) as Transaction["query"];
			return callback(tx);
		});
	}) as PGlite["transaction"];
	client.transaction = patched;
	return {
		delayed: () => taken,
		restore() {
			client.transaction = original;
		},
	};
}

async function openDatabase(): Promise<{ db: AppDatabase; client: PGlite; close: () => Promise<void> }> {
	const client = new PGlite();
	await client.exec(migrationSql);
	return {
		db: drizzlePglite(client, { schema }),
		client,
		close: () => client.close(),
	};
}

function begin(db: AppDatabase, accountId: string) {
	return new Kernel(createRepositories(db)).beginSend({ accountId, mode: "account" }, ads);
}

function finish(db: AppDatabase, accountId: string, taskId: string) {
	return new Kernel(createRepositories(db)).finishSend({ accountId, mode: "account" }, taskId);
}

function taskOf(started: { kind: string; taskId?: string }): string {
	assert.equal(started.kind, "working");
	if (typeof started.taskId !== "string") {
		throw new Error("The task id is missing.");
	}
	return started.taskId;
}

function isObject(error: unknown): error is object {
	return Boolean(error) && typeof error === "object";
}

function messageRecord(error: unknown, depth: number): { message?: unknown; cause?: unknown } | undefined {
	if (depth > 5 || !isObject(error)) {
		return undefined;
	}
	return error as { message?: unknown; cause?: unknown };
}

function findUnfinished(error: unknown, depth = 0): boolean {
	const record = messageRecord(error, depth);
	if (!record) {
		return false;
	}
	if (record.message === unfinished) {
		return true;
	}
	return findUnfinished(record.cause, depth + 1);
}

async function counts(db: AppDatabase, accountId: string): Promise<{ messages: number; tasks: number }> {
	const messageRows = await db.select().from(schema.messages).where(eq(schema.messages.accountId, accountId));
	const eventRows = await db.select().from(schema.busEvents).where(eq(schema.busEvents.accountId, accountId));
	return {
		messages: messageRows.length,
		tasks: eventRows.filter((row) => row.kind === "Task").length,
	};
}

async function beginTwoDelayedStatements(db: AppDatabase, client: PGlite, accountId: string): Promise<string> {
	const hook = delayStatements(client, 2, statementDelayMs);
	try {
		const startedAt = Date.now();
		const started = await begin(db, accountId);
		const elapsed = Date.now() - startedAt;
		assert.equal(hook.delayed(), 2);
		assert.ok(elapsed >= statementDelayMs * 2);
		assert.ok(elapsed < PENDING_TASK_WINDOW_MS);
		return taskOf(started);
	} finally {
		hook.restore();
	}
}

async function completionState(db: AppDatabase, accountId: string) {
	return {
		messages: await db.select().from(schema.messages).where(eq(schema.messages.accountId, accountId)),
		events: await db.select().from(schema.busEvents).where(eq(schema.busEvents.accountId, accountId)),
		agents: await db.select().from(schema.agents).where(eq(schema.agents.accountId, accountId)),
		cursor: await db.select().from(schema.busCursors).where(eq(schema.busCursors.accountId, accountId)),
	};
}

async function finishPastTaskExpiry(db: AppDatabase, client: PGlite, accountId: string, taskId: string) {
	const before = await completionState(db, accountId);
	const hook = delayStatements(client, 2, statementDelayMs, 'from "bus_events"');
	try {
		await assert.rejects(
			() => finish(db, accountId, taskId),
			(error: unknown) => findUnfinished(error),
		);
		assert.equal(hook.delayed(), 2);
	} finally {
		hook.restore();
	}
	assert.deepEqual(await completionState(db, accountId), before);
	const started = await begin(db, accountId);
	const finished = await finish(db, accountId, taskOf(started));
	assert.equal(finished.kind, "replied");
	assert.ok((finished.messages ?? []).some((message) => message.text === reply));
}

async function sendPastTheWindow(db: AppDatabase, client: PGlite, accountId: string): Promise<void> {
	const before = await counts(db, accountId);
	const delays = delaysThatPassTheWindow();
	const hook = delayStatements(client, delays, statementDelayMs);
	const startedAt = Date.now();
	try {
		await assert.rejects(
			() => begin(db, accountId),
			(error: unknown) => findUnfinished(error),
		);
	} finally {
		hook.restore();
	}
	assert.ok(Date.now() - startedAt >= PENDING_TASK_WINDOW_MS);
	assert.equal(hook.delayed(), delays);
	assert.deepEqual(await counts(db, accountId), before);
	const started = await begin(db, accountId);
	const finished = await finish(db, accountId, taskOf(started));
	assert.equal(finished.kind, "replied");
	assert.ok((finished.messages ?? []).some((message) => message.text === reply));
}

test("two statements delayed 8 seconds each do not commit past the pending window", { timeout: 60_000 }, async () => {
	const opened = await openDatabase();
	try {
		await replaceDemoAccount(opened.db, "deadline-two", "clerk-deadline-two");
		const taskId = await beginTwoDelayedStatements(opened.db, opened.client, "deadline-two");
		assert.equal((await finish(opened.db, "deadline-two", taskId)).kind, "replied");
	} finally {
		await opened.close();
	}
});

test("a finish past its Task expiry rolls back all completion writes", { timeout: 90_000 }, async () => {
	const opened = await openDatabase();
	try {
		await replaceDemoAccount(opened.db, "deadline-finish", "clerk-deadline-finish");
		const taskId = await beginTwoDelayedStatements(opened.db, opened.client, "deadline-finish");
		await finishPastTaskExpiry(opened.db, opened.client, "deadline-finish", taskId);
	} finally {
		await opened.close();
	}
});

test("a send that passes the pending window rolls back and the next send replies", { timeout: 90_000 }, async () => {
	const opened = await openDatabase();
	try {
		await replaceDemoAccount(opened.db, "deadline-late", "clerk-deadline-late");
		await sendPastTheWindow(opened.db, opened.client, "deadline-late");
	} finally {
		await opened.close();
	}
});
