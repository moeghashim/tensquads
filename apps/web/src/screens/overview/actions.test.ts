import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { enqueueDecision, resetDecisions, shownApprovalCount } from "./actions.ts";

describe("overview decisions", { concurrency: false }, () => {
	test("a finished decision refreshes and clears the guard", async () => {
		resetDecisions();
		let calls = 0;
		let refreshed = 0;
		await settled(
			"one",
			4,
			async () => {
				calls += 1;
			},
			async () => {
				refreshed += 1;
			},
		);
		assert.equal(calls, 1);
		assert.equal(refreshed, 1);
		assert.equal(shownApprovalCount(4), 4);
		await settled(
			"two",
			4,
			async () => {
				calls += 1;
			},
			async () => {
				refreshed += 1;
			},
		);
		assert.equal(calls, 2);
	});

	test("a failed write still refreshes, restores the count, and clears the guard", async () => {
		resetDecisions();
		let refreshed = 0;
		const result = await settled(
			"one",
			4,
			async () => {
				throw new Error("The write failed.");
			},
			async () => {
				refreshed += 1;
			},
		);
		assert.equal(refreshed, 1);
		assert.equal(result.wrote, false);
		assert.equal(shownApprovalCount(4), 4);
		const again = enqueueDecision(
			"one",
			4,
			async () => undefined,
			async () => undefined,
			() => undefined,
		);
		assert.equal(again, true);
		resetDecisions();
	});

	test("a failed refresh still clears the guard", async () => {
		resetDecisions();
		const result = await settled(
			"one",
			4,
			async () => undefined,
			async () => {
				throw new Error("The refresh failed.");
			},
		);
		assert.equal(result.wrote, true);
		assert.equal(result.refreshed, false);
		assert.equal(shownApprovalCount(4), 3);
		const again = enqueueDecision(
			"one",
			3,
			async () => undefined,
			async () => undefined,
			() => undefined,
		);
		assert.equal(again, true);
		resetDecisions();
	});

	test("two cards queue in click order and a double click sends one write", async () => {
		resetDecisions();
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const seen: string[] = [];
		const first = settled(
			"refund",
			4,
			async () => {
				seen.push("refund");
				await gate;
			},
			async () => {
				seen.push("refresh-refund");
			},
		);
		const second = settled(
			"marketing",
			4,
			async () => {
				seen.push("marketing");
			},
			async () => {
				seen.push("refresh-marketing");
			},
		);
		await Promise.resolve();
		assert.deepEqual(seen, ["refund"]);
		assert.equal(shownApprovalCount(4), 2);
		const duplicate = enqueueDecision(
			"refund",
			4,
			async () => {
				seen.push("duplicate");
			},
			async () => undefined,
			() => undefined,
		);
		assert.equal(duplicate, false);
		release();
		await first;
		await second;
		assert.deepEqual(seen, ["refund", "refresh-refund", "marketing", "refresh-marketing"]);
	});

	test("a failed write lets the queued card run", async () => {
		resetDecisions();
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const seen: string[] = [];
		const first = settled(
			"refund",
			4,
			async () => {
				seen.push("refund");
				await gate;
				throw new Error("The write failed.");
			},
			async () => {
				seen.push("refresh-refund");
			},
		);
		const second = settled(
			"marketing",
			4,
			async () => {
				seen.push("marketing");
			},
			async () => {
				seen.push("refresh-marketing");
			},
		);
		await Promise.resolve();
		assert.equal(shownApprovalCount(4), 2);
		release();
		await first;
		await second;
		assert.deepEqual(seen, ["refund", "refresh-refund", "marketing", "refresh-marketing"]);
		assert.equal(shownApprovalCount(4), 4);
	});

	test("a hung write aborts, refreshes, and the queue goes on", async (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		resetDecisions();
		let refreshed = 0;
		const running = settled(
			"refund",
			4,
			() => new Promise(() => undefined),
			async () => {
				refreshed += 1;
			},
		);
		const next = settled(
			"marketing",
			4,
			async () => undefined,
			async () => {
				refreshed += 1;
			},
		);
		await Promise.resolve();
		assert.equal(shownApprovalCount(4), 2);
		t.mock.timers.tick(30_000);
		await running;
		await next;
		assert.equal(refreshed, 2);
		assert.equal(shownApprovalCount(4), 4);
	});
});

function settled(
	key: string,
	serverCount: number,
	work: (signal: AbortSignal) => Promise<unknown>,
	refresh: () => Promise<unknown>,
): Promise<{ readonly wrote: boolean; readonly refreshed: boolean }> {
	return new Promise((resolve) => {
		const queued = enqueueDecision(key, serverCount, work, refresh, resolve);
		assert.equal(queued, true);
	});
}
