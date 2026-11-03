import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { OverviewData } from "./types.ts";
import { presentOverview, type DecisionKind } from "./view.ts";

import { currentWrites } from "#/workspace/approval-count.ts";

import {
	acceptOverviewRead,
	type DecisionRefresh,
	type DecisionResult,
	enqueueDecision,
	patchSnapshot,
	reconcileDecisions,
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
		acceptOverviewRead(snapshot(3), started);
		assert.equal(patchSnapshot().length, 1);
		acceptOverviewRead(snapshot(3), currentWrites());
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
					return { count: 1, readAt: currentWrites(), dropLanded: true };
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
			async () => ({ count: 4, readAt: currentWrites(), dropLanded: true }),
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
	refresh: () => Promise<DecisionRefresh>,
): Promise<DecisionResult> {
	return new Promise((resolve) => {
		const queued = enqueueDecision(patch(key), serverCount, work, refresh, resolve);
		assert.equal(queued, true);
	});
}

function patch(key: string) {
	return { key, id: key, kind: "spend-approve" as const };
}


function snapshot(count: number): OverviewData {
	return {
		greeting: "Good morning, Moe", mission: "", online: "", tiles: [], bars: [], count,
		empty: false, emptyText: "", masterName: "Master", agents: [],
		approvals: [{ id: "ap1", agentName: "Support", tint: "", amount: "$42", title: "Refund", detail: "" }],
		proposals: [{ id: "mp1", agentName: "Inventory", tint: "", title: "Proposed mission", mission: "Stock", chips: [], proposed: true, revising: false }],
	};
}

for (const kind of ["spend-approve", "spend-decline", "mission-approve", "mission-revise"] as const satisfies readonly DecisionKind[]) {
	for (const reflected of [false, true]) {
		test(`${kind} counts a held patch only when the accepted snapshot still needs it: ${reflected}`, async () => {
			resetDecisions();
			const item = { key: "held", id: kind.startsWith("spend") ? "ap1" : "mp1", kind };
			let release = () => {};
			const gate = new Promise<void>((resolve) => { release = resolve; });
			const refresh = async () => ({ count: 3, readAt: currentWrites(), dropLanded: true });
			const done = new Promise<DecisionResult>((resolve) => {
				assert.equal(enqueueDecision(item, 4, () => gate, refresh, resolve), true);
			});
			const before = snapshot(4);
			const page = reflected ? presentOverview(before, [item]) : before;
			acceptOverviewRead(page, currentWrites());
			assert.equal(shownApprovalCount(page.count), 3);
			assert.equal(presentOverview(page, patchSnapshot()).count, 3);
			assert.equal(patchSnapshot().length, 1);
			assert.equal(enqueueDecision(item, page.count, () => gate, refresh, () => {}), false);
			reconcileDecisions(page.count, currentWrites(), false);
			assert.equal(shownApprovalCount(page.count), 3);
			release();
			await done;
			assert.deepEqual(patchSnapshot(), []);
		});
	}
}
