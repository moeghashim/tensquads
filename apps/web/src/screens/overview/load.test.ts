import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { advanceWrites, currentWrites } from "#/workspace/approval-count.ts";
import { resetDecisions } from "./actions.ts";
import { clearOverviewHold, loadHeldOverview, overviewEpoch, overviewNeedsRead, rememberOverview } from "./load.ts";
import type { OverviewData } from "./types.ts";

describe("overview read recovery", { concurrency: false }, () => {
	test("a first load with no snapshot still throws", async () => {
		clearOverviewHold();
		await assert.rejects(
			() => loadHeldOverview(overviewEpoch(), currentWrites(), async () => fail()),
			/The overview did not load/,
		);
		assert.equal(overviewNeedsRead(), false);
	});

	test("a failed read keeps the snapshot and the next read runs once", async () => {
		clearOverviewHold();
		const firstWriteAt = currentWrites();
		const first = await loadHeldOverview(overviewEpoch(), firstWriteAt, async () => snapshot(4));
		assert.equal(first.count, 4);
		assert.equal(first.approvals.length, 1);
		assert.equal(overviewNeedsRead(), false);
		let failedReads = 0;
		const kept = await loadHeldOverview(overviewEpoch(), advanceWrites(), async () => {
			failedReads += 1;
			return fail();
		});
		assert.equal(failedReads, 1);
		assert.equal(kept.count, 4);
		assert.equal(kept.writeAt, firstWriteAt);
		assert.equal(kept.approvals.length, 1);
		assert.equal(overviewNeedsRead(), true);
		let nextReads = 0;
		const nextWriteAt = advanceWrites();
		const refreshed = await loadHeldOverview(overviewEpoch(), nextWriteAt, async () => {
			nextReads += 1;
			return snapshot(2);
		});
		assert.equal(nextReads, 1);
		assert.equal(refreshed.count, 2);
		assert.equal(refreshed.writeAt, nextWriteAt);
		assert.equal(overviewNeedsRead(), false);
		const again = await loadHeldOverview(overviewEpoch(), advanceWrites(), async () => fail());
		assert.equal(again.count, 2);
		assert.equal(again.writeAt, nextWriteAt);
		assert.equal(overviewNeedsRead(), true);
	});

	test("an older completion and remembered page cannot replace an accepted newer snapshot", async () => {
		clearOverviewHold();
		const oldWriteAt = currentWrites();
		const oldData = snapshot(4);
		let release!: (data: OverviewData) => void;
		const older = loadHeldOverview(
			overviewEpoch(),
			oldWriteAt,
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		const writeAt = advanceWrites();
		const newerData = snapshot(3, "ap2", "Restock");
		const newer = await loadHeldOverview(overviewEpoch(), writeAt, async () => newerData);
		release(oldData);
		const obsolete = await older;
		assert.deepEqual(obsolete, { ...oldData, writeAt: oldWriteAt });
		const afterCompletion = await loadHeldOverview(overviewEpoch(), writeAt, async () => fail());
		assert.strictEqual(afterCompletion, newer);
		await loadHeldOverview(overviewEpoch(), writeAt, async () => newerData);
		rememberOverview(obsolete);
		const kept = await loadHeldOverview(overviewEpoch(), writeAt, async () => fail());
		assert.deepEqual(kept, newer);
		assert.equal(kept.writeAt, writeAt);
		assert.equal(kept.approvals[0]?.id, "ap2");
		assert.equal(kept.approvals[0]?.title, "Restock");
		assert.equal(overviewNeedsRead(), true);
	});

	test("an obsolete completion leaves recovery set until an accepted read", async () => {
		clearOverviewHold();
		const oldWriteAt = currentWrites();
		const accepted = await loadHeldOverview(overviewEpoch(), oldWriteAt, async () => snapshot(4));
		await loadHeldOverview(overviewEpoch(), oldWriteAt, async () => fail());
		const writeAt = advanceWrites();
		await loadHeldOverview(overviewEpoch(), oldWriteAt, async () => snapshot(3));
		rememberOverview({ ...snapshot(2), writeAt });
		assert.equal(overviewNeedsRead(), true);
		const kept = await loadHeldOverview(overviewEpoch(), writeAt, async () => fail());
		assert.strictEqual(kept, accepted);
		await loadHeldOverview(overviewEpoch(), writeAt, async () => snapshot(3));
		assert.equal(overviewNeedsRead(), false);
	});

	test("signing out drops the held snapshot", async () => {
		clearOverviewHold();
		await loadHeldOverview(overviewEpoch(), currentWrites(), async () => snapshot(4));
		resetDecisions();
		await assert.rejects(
			() => loadHeldOverview(overviewEpoch(), currentWrites(), async () => fail()),
			/The overview did not load/,
		);
		assert.equal(overviewNeedsRead(), false);
	});
});

function fail(): Promise<OverviewData> {
	return Promise.reject(new Error("The overview did not load."));
}

function snapshot(count: number, approvalId = "ap1", title = "Refund"): OverviewData {
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
		approvals: [{ id: approvalId, agentName: "Support", tint: "", amount: "$42", title, detail: "" }],
		agents: [],
		masterName: "Master",
	};
}
