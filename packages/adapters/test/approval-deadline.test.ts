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

const unfinished = "The workspace write did not finish.";
const statementDelayMs = 8_000;

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function delayStatements(
	client: PGlite,
	count: number,
	eachMs: number,
): { delayed: () => number; restore: () => void } {
	const original = client.transaction;
	let left = count;
	let taken = 0;
	const patched = (async (callback) => {
		return original.call(client, async (tx) => {
			const query = tx.query.bind(tx);
			tx.query = (async (text, params, options) => {
				if (left > 0) {
					left -= 1;
					taken += 1;
					await delay(eachMs);
				}
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

function kernel(db: AppDatabase) {
	return new Kernel(createRepositories(db));
}

function scope(accountId: string) {
	return { accountId, mode: "account" as const };
}

function isObject(error: unknown): error is object {
	return Boolean(error) && typeof error === "object";
}

function findUnfinished(error: unknown, depth = 0): boolean {
	if (depth > 5 || !isObject(error)) {
		return false;
	}
	const record = error as { message?: unknown; cause?: unknown };
	if (record.message === unfinished) {
		return true;
	}
	return findUnfinished(record.cause, depth + 1);
}

async function storedApproval(db: AppDatabase, accountId: string, id: string) {
	const rows = await db.select().from(schema.approvals).where(eq(schema.approvals.accountId, accountId));
	return rows.find((row) => row.id === id);
}

async function mandateCount(db: AppDatabase, accountId: string): Promise<number> {
	const rows = await db.select().from(schema.mandates).where(eq(schema.mandates.accountId, accountId));
	return rows.length;
}

test("a decision whose deadline already passed commits no Approval and no Mandate", async () => {
	const opened = await openDatabase();
	try {
		await replaceDemoAccount(opened.db, "deadline-late", "clerk-deadline-late");
		const before = await storedApproval(opened.db, "deadline-late", "ap1");
		assert.equal(before?.status, "Pending");
		await assert.rejects(
			() => kernel(opened.db).decide(scope("deadline-late"), "ap1", true, Date.now() - 1),
			(error: unknown) => findUnfinished(error),
		);
		assert.equal((await storedApproval(opened.db, "deadline-late", "ap1"))?.status, "Pending");
		assert.equal(await mandateCount(opened.db, "deadline-late"), 0);
	} finally {
		await opened.close();
	}
});

test("a late mission decision commits nothing", async () => {
	const opened = await openDatabase();
	try {
		await replaceDemoAccount(opened.db, "deadline-mission", "clerk-deadline-mission");
		await assert.rejects(
			() => kernel(opened.db).decideMission(scope("deadline-mission"), "mp-inventory", true, Date.now() - 1),
			(error: unknown) => findUnfinished(error),
		);
		const rows = await opened.db
			.select()
			.from(schema.missionProposals)
			.where(eq(schema.missionProposals.accountId, "deadline-mission"));
		assert.equal(rows.find((row) => row.id === "mp-inventory")?.status, "Proposed");
	} finally {
		await opened.close();
	}
});

test("a decision that runs past the window rolls the Approval and the Mandate back", { timeout: 90_000 }, async () => {
	const opened = await openDatabase();
	try {
		await replaceDemoAccount(opened.db, "deadline-slow", "clerk-deadline-slow");
		const delays = Math.floor(PENDING_TASK_WINDOW_MS / statementDelayMs) + 1;
		const hook = delayStatements(opened.client, delays, statementDelayMs);
		try {
			const startedAt = Date.now();
			await assert.rejects(
				() => kernel(opened.db).decide(scope("deadline-slow"), "ap1", true),
				(error: unknown) => findUnfinished(error),
			);
			assert.ok(Date.now() - startedAt >= PENDING_TASK_WINDOW_MS);
			assert.equal(hook.delayed(), delays);
			assert.equal((await storedApproval(opened.db, "deadline-slow", "ap1"))?.status, "Pending");
			assert.equal(await mandateCount(opened.db, "deadline-slow"), 0);
			const events = await opened.db
				.select()
				.from(schema.busEvents)
				.where(eq(schema.busEvents.accountId, "deadline-slow"));
			assert.equal(events.filter((row) => row.kind === "Approval").length, 0);
		} finally {
			hook.restore();
		}
	} finally {
		await opened.close();
	}
});
