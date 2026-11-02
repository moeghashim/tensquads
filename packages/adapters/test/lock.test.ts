import assert from "node:assert/strict";
import test from "node:test";

import { workspaceTransaction } from "../src/neon/lock.ts";

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
