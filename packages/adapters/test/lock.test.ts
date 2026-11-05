import assert from "node:assert/strict";
import test from "node:test";
import { workspaceTransaction } from "../src/neon/lock.ts";
import { writeAccount } from "../src/neon/save.ts";
import { PENDING_TASK_WINDOW_MS } from "../src/pending-window.ts";

function hangingTransaction(error: unknown) {
	let attempts = 0;
	return {
		attempts: () => attempts,
		db: {
			async transaction(run: (tx: { execute: () => Promise<void> }) => Promise<unknown>) {
				attempts += 1;
				await run({
					async execute() {
						return undefined;
					},
				});
				throw error;
			},
		},
	};
}

test("a unique violation whose text says deadlock detected is not retried", async () => {
	const unique = Object.assign(new Error("deadlock detected"), { code: "23505" });
	const fake = hangingTransaction(unique);
	await assert.rejects(
		() => workspaceTransaction(fake.db as never, async () => "ok"),
		(error: unknown) => {
			assert.equal((error as { code?: string }).code, "23505");
			assert.equal((error as { message?: string }).message, "deadlock detected");
			return true;
		},
	);
	assert.equal(fake.attempts(), 1);
});

test("a deadlock code retries the whole transaction three times", async () => {
	const deadlock = Object.assign(new Error("could not serialize"), { code: "40P01" });
	const fake = hangingTransaction(deadlock);
	await assert.rejects(() => workspaceTransaction(fake.db as never, async () => "ok"));
	assert.equal(fake.attempts(), 3);
});

test("a deadlock code on a cause retries, and the words alone do not", async () => {
	const caused = Object.assign(new Error("rollback"), {
		cause: Object.assign(new Error("driver"), { code: "40P01" }),
	});
	const byCode = hangingTransaction(caused);
	await assert.rejects(() => workspaceTransaction(byCode.db as never, async () => "ok"));
	assert.equal(byCode.attempts(), 3);

	const words = new Error("deadlock detected");
	const byText = hangingTransaction(words);
	await assert.rejects(() => workspaceTransaction(byText.db as never, async () => "ok"), /deadlock detected/);
	assert.equal(byText.attempts(), 1);
});

test("deadlock retries set timeouts that stay inside the pending window", async () => {
	const seen: string[] = [];
	let attempts = 0;
	const deadlock = Object.assign(new Error("could not serialize"), { code: "40P01" });
	const db = {
		async transaction(run: (tx: { execute: (query: unknown) => Promise<void> }) => Promise<unknown>) {
			attempts += 1;
			await run({
				async execute(query: unknown) {
					seen.push(JSON.stringify(query));
				},
			});
			throw deadlock;
		},
	};
	await assert.rejects(() =>
		workspaceTransaction(db as never, async () => "ok", { deadlineMs: PENDING_TASK_WINDOW_MS }),
	);
	assert.equal(attempts, 3);
	const text = seen.join("\n");
	assert.equal((text.match(/lock_timeout/g) ?? []).length, 3);
	assert.equal((text.match(/statement_timeout/g) ?? []).length, 3);
	const budgets = [...text.matchAll(/(\d+)ms/g)].map((match) => Number(match[1]));
	assert.ok(budgets.length >= 6);
	const distinct = [...new Set(budgets)];
	assert.equal(distinct.length, 1);
	const budget = distinct[0] ?? 0;
	assert.ok(budget > 0);
	assert.ok(budget < PENDING_TASK_WINDOW_MS);
	assert.ok(budget * 3 < PENDING_TASK_WINDOW_MS);
});

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

test("a transaction without send options does not set timeouts", async () => {
	const seen: string[] = [];
	const db = {
		async transaction(run: (tx: { execute: (query: unknown) => Promise<void> }) => Promise<unknown>) {
			return run({
				async execute(query: unknown) {
					seen.push(JSON.stringify(query));
				},
			});
		},
	};
	assert.equal(await workspaceTransaction(db as never, async () => "reset"), "reset");
	const text = seen.join("\n");
	assert.equal((text.match(/lock_timeout/g) ?? []).length, 0);
	assert.equal((text.match(/statement_timeout/g) ?? []).length, 0);
	assert.match(text, /SELECT pg_advisory_xact_lock\(1952804467, 1\)/);
	assert.doesNotMatch(text, /pg_advisory_xact_lock_shared/);
	assert.doesNotMatch(text, /1952804468/);
});

test("an account writer takes the global key shared, then that account's fence", async () => {
	const seen: string[] = [];
	const db = {
		async transaction(run: (tx: { execute: (query: unknown) => Promise<void> }) => Promise<unknown>) {
			return run({
				async execute(query: unknown) {
					seen.push(JSON.stringify(query));
				},
			});
		},
	};
	assert.equal(
		await workspaceTransaction(db as never, async () => "ok", {
			deadlineMs: PENDING_TASK_WINDOW_MS,
			accountId: "account-a",
		}),
		"ok",
	);
	const text = seen.join("\n");
	const sharedAt = text.indexOf("pg_advisory_xact_lock_shared(1952804467, 1)");
	const accountAt = text.indexOf("pg_advisory_xact_lock(1952804468, hashtext('account-a'))");
	assert.ok(sharedAt >= 0);
	assert.ok(accountAt > sharedAt);
	assert.doesNotMatch(text, /pg_advisory_xact_lock\(1952804467, 1\)/);
});

test("an account reset takes the account fence and sets no timeout", async () => {
	const seen: string[] = [];
	const db = {
		async transaction(
			run: (tx: {
				execute: (query: unknown) => Promise<void>;
				delete: () => { where: () => never };
			}) => Promise<unknown>,
		) {
			return run({
				async execute(query: unknown) {
					seen.push(JSON.stringify(query));
				},
				delete() {
					return {
						where() {
							throw new Error("stop after the lock");
						},
					};
				},
			});
		},
	};
	await assert.rejects(
		() => writeAccount(db as never, { account: { id: "account-a" } } as never),
		/stop after the lock/,
	);
	const text = seen.join("\n");
	assert.equal((text.match(/lock_timeout/g) ?? []).length, 0);
	assert.equal((text.match(/statement_timeout/g) ?? []).length, 0);
	const sharedAt = text.indexOf("pg_advisory_xact_lock_shared(1952804467, 1)");
	const accountAt = text.indexOf("pg_advisory_xact_lock(1952804468, hashtext('account-a'))");
	assert.ok(sharedAt >= 0);
	assert.ok(accountAt > sharedAt);
	assert.doesNotMatch(text, /pg_advisory_xact_lock\(1952804467, 1\)/);
});

test("a send past the deadline rolls back before commit", async () => {
	let attempts = 0;
	let committed = false;
	const db = {
		async transaction(run: (tx: { execute: () => Promise<void> }) => Promise<unknown>) {
			attempts += 1;
			const value = await run({
				async execute() {
					return undefined;
				},
			});
			committed = true;
			return value;
		},
	};
	await assert.rejects(
		() =>
			workspaceTransaction(
				db as never,
				async () => {
					await delay(30);
					return "task";
				},
				{ deadlineMs: 15 },
			),
		(error: unknown) => error instanceof Error && error.message === "The workspace write did not finish.",
	);
	assert.equal(attempts, 1);
	assert.equal(committed, false);
});

test("a deadlock retry does not start when the time left is below its budget", async () => {
	let attempts = 0;
	const deadlock = Object.assign(new Error("could not serialize"), { code: "40P01" });
	const db = {
		async transaction(run: (tx: { execute: () => Promise<void> }) => Promise<unknown>) {
			attempts += 1;
			await run({
				async execute() {
					return undefined;
				},
			});
			await delay(40);
			throw deadlock;
		},
	};
	await assert.rejects(
		() => workspaceTransaction(db as never, async () => "ok", { deadlineMs: 50 }),
		(error: unknown) => error instanceof Error && error.message === "The workspace write did not finish.",
	);
	assert.equal(attempts, 1);
});

test("a deadlock retry must fit the earlier Task deadline", async () => {
	let attempts = 0;
	const deadlock = Object.assign(new Error("could not serialize"), { code: "40P01" });
	const db = {
		async transaction(run: (tx: { execute: () => Promise<void> }) => Promise<unknown>) {
			attempts += 1;
			await run({ execute: async () => undefined });
			throw deadlock;
		},
	};
	await assert.rejects(
		() =>
			workspaceTransaction(
				db as never,
				async (_tx, constrainDeadline) => {
					constrainDeadline(Date.now() + 60);
					await delay(40);
					return "result";
				},
				{ deadlineMs: 150 },
			),
		/The workspace write did not finish\./,
	);
	assert.equal(attempts, 1);
});

test("a later constraint cannot extend the request deadline", async () => {
	let committed = false;
	const db = {
		async transaction(run: (tx: { execute: () => Promise<void> }) => Promise<unknown>) {
			const value = await run({ execute: async () => undefined });
			committed = true;
			return value;
		},
	};
	await assert.rejects(
		() =>
			workspaceTransaction(
				db as never,
				async (_tx, constrainDeadline) => {
					constrainDeadline(Date.now() + 1_000);
					await delay(30);
					return "result";
				},
				{ deadlineMs: 15 },
			),
		/The workspace write did not finish\./,
	);
	assert.equal(committed, false);
});
