import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { currentWrites } from "#/workspace/approval-count.ts";

import {
	acceptOverviewRead,
	type DecisionResult,
	enqueueDecision,
	patchSnapshot,
	resetDecisions,
	shownApprovalCount,
	watchServerCount,
} from "./actions.ts";

describe("overview account and landed reads", { concurrency: false }, () => {
	test("a finished write keeps its patch until a read that started after it landed", async () => {
		resetDecisions();
		const started = currentWrites();
		await settled(
			"refund",
			4,
			async () => ({ id: "ap1", status: "Approved", count: 3 }),
			async () => ({ count: 3, readAt: started, dropLanded: true }),
		);
		assert.deepEqual(
			patchSnapshot().map((item) => item.key),
			["refund"],
		);
		assert.equal(shownApprovalCount(3), 3);
		const frame = { approvalCount: 3 };
		watchServerCount(frame.approvalCount, frame, currentWrites());
		await Promise.resolve();
		assert.deepEqual(
			patchSnapshot().map((item) => item.key),
			["refund"],
		);
		acceptOverviewRead(3, started);
		assert.equal(patchSnapshot().length, 1);
		acceptOverviewRead(3, currentWrites());
		assert.deepEqual(patchSnapshot(), []);
		assert.equal(shownApprovalCount(3), 3);
	});

	test("a job from the previous account does not change the next account", async () => {
		resetDecisions();
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		let refreshA = 0;
		let markStarted = () => {};
		const started = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		const first = new Promise<DecisionResult>((resolve) => {
			const queued = enqueueDecision(
				patch("refund"),
				4,
				async () => {
					markStarted();
					await gate;
					return { id: "ap1", status: "Approved", count: 1 };
				},
				async () => {
					refreshA += 1;
					return 1;
				},
				resolve,
			);
			assert.equal(queued, true);
		});
		await started;
		resetDecisions();
		const second = settled(
			"other",
			4,
			async () => ({ id: "ap9", status: "Approved", count: 4 }),
			async () => 4,
		);
		release();
		await first;
		await second;
		assert.equal(refreshA, 0);
		assert.deepEqual(patchSnapshot(), []);
		assert.equal(shownApprovalCount(4), 4);
	});
});

function settled(
	key: string,
	serverCount: number,
	work: (signal: AbortSignal) => Promise<unknown>,
	refresh: () => Promise<number | { count: number; readAt: number; dropLanded: boolean } | undefined>,
): Promise<DecisionResult> {
	return new Promise((resolve) => {
		const queued = enqueueDecision(patch(key), serverCount, work, async () => (await refresh()) ?? 4, resolve);
		assert.equal(queued, true);
	});
}

function patch(key: string) {
	return { key, id: key, kind: "spend-approve" as const };
}
