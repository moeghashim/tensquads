import assert from "node:assert/strict";
import test from "node:test";

import { runDecision } from "./actions.ts";

test("a finished decision refreshes and clears the guard", async () => {
	const pending = { current: false };
	let calls = 0;
	let refreshed = 0;
	await runDecision(
		pending,
		async () => {
			calls += 1;
		},
		async () => {
			refreshed += 1;
		},
	);
	assert.equal(calls, 1);
	assert.equal(refreshed, 1);
	assert.equal(pending.current, false);
	await runDecision(
		pending,
		async () => {
			calls += 1;
		},
		async () => {
			refreshed += 1;
		},
	);
	assert.equal(calls, 2);
});

test("a failed write still refreshes and clears the guard", async () => {
	const pending = { current: false };
	let refreshed = 0;
	await runDecision(
		pending,
		async () => {
			throw new Error("The write failed.");
		},
		async () => {
			refreshed += 1;
		},
	);
	assert.equal(refreshed, 1);
	assert.equal(pending.current, false);
});

test("a failed refresh still clears the guard", async () => {
	const pending = { current: false };
	await runDecision(
		pending,
		async () => undefined,
		async () => {
			throw new Error("The refresh failed.");
		},
	);
	assert.equal(pending.current, false);
});

test("a second click during the write does nothing", async () => {
	const pending = { current: false };
	let release = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let calls = 0;
	const first = runDecision(
		pending,
		async () => {
			calls += 1;
			await gate;
		},
		async () => undefined,
	);
	await Promise.resolve();
	await runDecision(
		pending,
		async () => {
			calls += 1;
		},
		async () => undefined,
	);
	assert.equal(calls, 1);
	assert.equal(pending.current, true);
	release();
	await first;
	assert.equal(pending.current, false);
	assert.equal(calls, 1);
});

test("a hung write aborts, refreshes, and clears the guard", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const pending = { current: false };
	let refreshed = 0;
	const running = runDecision(
		pending,
		() => new Promise(() => undefined),
		async () => {
			refreshed += 1;
		},
	);
	await Promise.resolve();
	assert.equal(pending.current, true);
	t.mock.timers.tick(30_000);
	await running;
	assert.equal(refreshed, 1);
	assert.equal(pending.current, false);
});
