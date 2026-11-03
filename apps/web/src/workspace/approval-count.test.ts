import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
	advanceWrites,
	captureWrites,
	currentWrites,
	noteDecisionCount,
	noteFrameCount,
	seedApprovalCount,
} from "./approval-count.ts";

describe("approval count clock", () => {
	test("a frame read replaces the seed when no decision has answered", () => {
		const seeded = seedApprovalCount(4);
		assert.equal(seeded.writeAt, 0);
		const next = noteFrameCount(seeded, 5, 0, 0);
		assert.equal(next.value, 5);
		assert.equal(next.writeAt, 0);
	});

	test("a frame read that started before the decision does not replace it", () => {
		const decided = noteDecisionCount(seedApprovalCount(4), 3, 2);
		const next = noteFrameCount(decided, 4, 1, 2);
		assert.equal(next.value, 3);
		assert.equal(next.writeAt, 2);
	});

	test("a read in the same millisecond replaces the count when it started after the decision", () => {
		// Date.now() would give both the same value. The counter still orders them.
		const decided = noteDecisionCount(seedApprovalCount(4), 3, 1);
		const next = noteFrameCount(decided, 2, 1, 1);
		assert.equal(next.value, 2);
		assert.equal(next.writeAt, 1);
	});

	test("a backward clock does not keep a count the counter has already passed", () => {
		// A wall clock 60 seconds earlier would be less than the decision's old timestamp.
		const decided = noteDecisionCount(seedApprovalCount(4), 3, 5);
		const next = noteFrameCount(decided, 2, 6, 6);
		assert.equal(next.value, 2);
		assert.equal(next.writeAt, 6);
	});

	test("a frame read that started after the decision replaces it", () => {
		const decided = noteDecisionCount(seedApprovalCount(4), 3, 2);
		const next = noteFrameCount(decided, 2, 3, 3);
		assert.equal(next.value, 2);
		assert.equal(next.writeAt, 3);
	});

	test("an earlier decision does not replace a later one", () => {
		const later = noteDecisionCount(seedApprovalCount(4), 3, 4);
		const next = noteDecisionCount(later, 4, 2);
		assert.equal(next.value, 3);
		assert.equal(next.writeAt, 4);
	});

	test("the browser counter accepts a later read and rejects one a write passed", () => {
		const before = captureWrites();
		const started = advanceWrites();
		const decided = noteDecisionCount(seedApprovalCount(4), 3, started);
		const settled = advanceWrites();
		const readAt = captureWrites();
		assert.equal(readAt, settled);
		assert.equal(currentWrites(), settled);
		const accepted = noteFrameCount(decided, 2, readAt, currentWrites());
		assert.equal(accepted.value, 2);
		const rejected = noteFrameCount(accepted, 4, before, currentWrites());
		assert.equal(rejected.value, 2);
	});
});
