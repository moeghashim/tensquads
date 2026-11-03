import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isRedirect, redirect } from "@tanstack/react-router";
import { resetDecisions } from "#/screens/overview/actions.ts";
import { isSessionRefreshNeeded, SessionRefreshNeeded } from "#/server/session-error.ts";
import { advanceWrites, currentWrites } from "#/workspace/approval-count.ts";
import { clearFrameHold, frameEpoch, frameNeedsRead, loadHeldFrame, rememberFrame } from "./frame-load.ts";
import type { WorkspaceFrameData } from "./types.ts";

describe("workspace frame recovery", { concurrency: false }, () => {
	test("a first load with no frame still throws", async () => {
		clearFrameHold();
		await assert.rejects(
			() => loadHeldFrame(frameEpoch(), currentWrites(), async () => fail()),
			/The workspace frame did not load/,
		);
		assert.equal(frameNeedsRead(), false);
	});

	test("a failed read keeps the frame and the next read runs once", async () => {
		clearFrameHold();
		const firstWriteAt = currentWrites();
		const first = await loadHeldFrame(frameEpoch(), firstWriteAt, async () => frame(4));
		assert.equal(first.approvalCount, 4);
		assert.equal(first.accountName, "Northwind");
		assert.equal(frameNeedsRead(), false);
		let failedReads = 0;
		const kept = await loadHeldFrame(frameEpoch(), advanceWrites(), async () => {
			failedReads += 1;
			return fail();
		});
		assert.equal(failedReads, 1);
		assert.equal(kept.approvalCount, 4);
		assert.equal(kept.writeAt, firstWriteAt);
		assert.equal(kept.accountName, "Northwind");
		assert.equal(frameNeedsRead(), true);
		let nextReads = 0;
		const nextWriteAt = advanceWrites();
		const refreshed = await loadHeldFrame(frameEpoch(), nextWriteAt, async () => {
			nextReads += 1;
			return frame(2, "Later");
		});
		assert.equal(nextReads, 1);
		assert.equal(refreshed.approvalCount, 2);
		assert.equal(refreshed.writeAt, nextWriteAt);
		assert.equal(refreshed.accountName, "Later");
		assert.equal(frameNeedsRead(), false);
		const again = await loadHeldFrame(frameEpoch(), advanceWrites(), async () => fail());
		assert.equal(again.approvalCount, 2);
		assert.equal(again.writeAt, nextWriteAt);
		assert.equal(frameNeedsRead(), true);
	});

	test("an older completion and remembered frame cannot replace an accepted newer frame", async () => {
		clearFrameHold();
		const oldWriteAt = currentWrites();
		const oldData = frame(4);
		let release!: (data: WorkspaceFrameData) => void;
		const older = loadHeldFrame(
			frameEpoch(),
			oldWriteAt,
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		const writeAt = advanceWrites();
		const newerData = frame(3, "Restock");
		const newer = await loadHeldFrame(frameEpoch(), writeAt, async () => newerData);
		release(oldData);
		const obsolete = await older;
		assert.deepEqual(obsolete, { ...oldData, writeAt: oldWriteAt });
		const afterCompletion = await loadHeldFrame(frameEpoch(), writeAt, async () => fail());
		assert.strictEqual(afterCompletion, newer);
		await loadHeldFrame(frameEpoch(), writeAt, async () => newerData);
		rememberFrame(obsolete);
		const kept = await loadHeldFrame(frameEpoch(), writeAt, async () => fail());
		assert.deepEqual(kept, newer);
		assert.equal(kept.writeAt, writeAt);
		assert.equal(kept.accountName, "Restock");
		assert.equal(frameNeedsRead(), true);
	});

	test("an obsolete completion leaves recovery set until an accepted read", async () => {
		clearFrameHold();
		const oldWriteAt = currentWrites();
		const accepted = await loadHeldFrame(frameEpoch(), oldWriteAt, async () => frame(4));
		await loadHeldFrame(frameEpoch(), oldWriteAt, async () => fail());
		const writeAt = advanceWrites();
		await loadHeldFrame(frameEpoch(), oldWriteAt, async () => frame(3));
		rememberFrame({ ...frame(2), writeAt });
		assert.equal(frameNeedsRead(), true);
		const kept = await loadHeldFrame(frameEpoch(), writeAt, async () => fail());
		assert.strictEqual(kept, accepted);
		await loadHeldFrame(frameEpoch(), writeAt, async () => frame(3));
		assert.equal(frameNeedsRead(), false);
	});

	test("a session refresh is not kept as the previous frame", async () => {
		clearFrameHold();
		await loadHeldFrame(frameEpoch(), currentWrites(), async () => frame(4));
		await assert.rejects(
			() =>
				loadHeldFrame(frameEpoch(), currentWrites(), () => {
					throw new SessionRefreshNeeded();
				}),
			(error: unknown) => isSessionRefreshNeeded(error),
		);
		assert.equal(frameNeedsRead(), false);
	});

	test("a sign-in redirect is not kept as the previous frame", async () => {
		clearFrameHold();
		await loadHeldFrame(frameEpoch(), currentWrites(), async () => frame(4));
		await assert.rejects(
			() =>
				loadHeldFrame(frameEpoch(), currentWrites(), () => {
					throw redirect({ to: "/signin" });
				}),
			(error: unknown) => isRedirect(error),
		);
	});

	test("signing out drops the held frame", async () => {
		clearFrameHold();
		await loadHeldFrame(frameEpoch(), currentWrites(), async () => frame(4));
		resetDecisions();
		await assert.rejects(
			() => loadHeldFrame(frameEpoch(), currentWrites(), async () => fail()),
			/The workspace frame did not load/,
		);
		assert.equal(frameNeedsRead(), false);
	});
});

function fail(): Promise<WorkspaceFrameData> {
	return Promise.reject(new Error("The workspace frame did not load."));
}

function frame(approvalCount: number, accountName = "Northwind"): WorkspaceFrameData {
	return {
		accountId: "northwind",
		accountName,
		owner: "Moe",
		masterName: "Master",
		squadCount: 0,
		superAdmin: false,
		agents: [],
		approvalCount,
		messages: [],
	};
}
