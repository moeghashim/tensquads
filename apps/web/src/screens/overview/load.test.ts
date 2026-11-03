import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resetDecisions } from "./actions.ts";
import { clearOverviewHold, loadHeldOverview, overviewEpoch, overviewNeedsRead } from "./load.ts";
import type { OverviewData } from "./types.ts";

describe("overview read recovery", { concurrency: false }, () => {
	test("a first load with no snapshot still throws", async () => {
		clearOverviewHold();
		await assert.rejects(() => loadHeldOverview(overviewEpoch(), 0, async () => fail()), /The overview did not load/);
		assert.equal(overviewNeedsRead(), false);
	});

	test("a failed read keeps the snapshot and the next read runs once", async () => {
		clearOverviewHold();
		const first = await loadHeldOverview(overviewEpoch(), 1, async () => snapshot(4));
		assert.equal(first.count, 4);
		assert.equal(first.approvals.length, 1);
		assert.equal(overviewNeedsRead(), false);
		let failedReads = 0;
		const kept = await loadHeldOverview(overviewEpoch(), 4, async () => {
			failedReads += 1;
			return fail();
		});
		assert.equal(failedReads, 1);
		assert.equal(kept.count, 4);
		assert.equal(kept.writeAt, 1);
		assert.equal(kept.approvals.length, 1);
		assert.equal(overviewNeedsRead(), true);
		let nextReads = 0;
		const refreshed = await loadHeldOverview(overviewEpoch(), 5, async () => {
			nextReads += 1;
			return snapshot(2);
		});
		assert.equal(nextReads, 1);
		assert.equal(refreshed.count, 2);
		assert.equal(refreshed.writeAt, 5);
		assert.equal(overviewNeedsRead(), false);
		const again = await loadHeldOverview(overviewEpoch(), 6, async () => fail());
		assert.equal(again.count, 2);
		assert.equal(again.writeAt, 5);
		assert.equal(overviewNeedsRead(), true);
	});

	test("signing out drops the held snapshot", async () => {
		clearOverviewHold();
		await loadHeldOverview(overviewEpoch(), 1, async () => snapshot(4));
		resetDecisions();
		await assert.rejects(() => loadHeldOverview(overviewEpoch(), 2, async () => fail()), /The overview did not load/);
		assert.equal(overviewNeedsRead(), false);
	});
});

function fail(): Promise<OverviewData> {
	return Promise.reject(new Error("The overview did not load."));
}

function snapshot(count: number): OverviewData {
	return {
		greeting: "Good morning, Moe",
		mission: "",
		online: "",
		tiles: [],
		bars: [],
		count,
		empty: false,
		emptyText: "",
		proposals: [],
		approvals: [{ id: "ap1", agentName: "Support", tint: "", amount: "$42", title: "Refund", detail: "" }],
		agents: [],
		masterName: "Master",
	};
}
