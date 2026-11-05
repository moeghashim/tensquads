import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { currentWrites } from "#/workspace/approval-count.ts";
import {
	acceptOverviewRead,
	type DecisionRefresh,
	type DecisionResult,
	enqueueDecision,
	patchSnapshot,
	resetDecisions,
	shownApprovalCount,
} from "./actions.ts";
import type { OverviewData } from "./types.ts";

// A decision that needs a session refresh is a failed write. These cases keep that file under the length limit.
describe("overview decisions that need a refresh", { concurrency: false }, () => {
	test("a refresh-needed decision does not read again and keeps the queued hold", async () => {
		resetDecisions();
		const data: OverviewData = {
			accountId: "demo",
			greeting: "",
			mission: "",
			online: "",
			tiles: [],
			bars: [],
			count: 2,
			empty: false,
			emptyText: "",
			masterName: "Petra",
			agents: [],
			proposals: [],
			approvals: ["refund", "marketing"].map((id) => ({
				id,
				agentId: "support",
				agentName: "Support",
				tint: "",
				amount: "$42",
				title: id,
				detail: "",
			})),
		};
		let reads = 0;
		const first = settled(
			"refund",
			2,
			async () => {
				throw new Error("The session needs a refresh.");
			},
			async () => {
				reads += 1;
				const readAt = currentWrites();
				acceptOverviewRead(data, readAt);
				return { count: 2, readAt, dropLanded: true };
			},
		);
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const second = settled(
			"marketing",
			2,
			() => gate,
			async () => ({ count: 1, readAt: currentWrites(), dropLanded: true }),
		);
		try {
			const result = await first;
			assert.equal(reads, 0);
			assert.equal(result.refreshNeeded, true);
			assert.equal(result.refreshed, false);
			assert.equal(shownApprovalCount(2), 1);
			assert.deepEqual(
				patchSnapshot().map((item) => item.key),
				["marketing"],
			);
		} finally {
			release();
			await second;
		}
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
