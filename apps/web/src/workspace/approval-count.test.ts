import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { noteDecisionCount, noteFrameCount, seedApprovalCount } from "./approval-count.ts";

describe("approval count clock", () => {
	test("a frame read replaces the seed when no decision has answered", () => {
		const seeded = seedApprovalCount(4);
		assert.equal(seeded.decisionAt, 0);
		const next = noteFrameCount(seeded, 5, 1);
		assert.equal(next.value, 5);
		assert.equal(next.decisionAt, 0);
	});

	test("a frame read that started before the decision does not replace it", () => {
		const decided = noteDecisionCount(seedApprovalCount(4), 3, 10);
		const next = noteFrameCount(decided, 4, 9);
		assert.equal(next.value, 3);
		assert.equal(next.decisionAt, 10);
	});

	test("a frame read that starts as the decision answers does not replace it", () => {
		const decided = noteDecisionCount(seedApprovalCount(4), 3, 10);
		const next = noteFrameCount(decided, 4, 10);
		assert.equal(next.value, 3);
	});

	test("a frame read that started after the decision replaces it", () => {
		const decided = noteDecisionCount(seedApprovalCount(4), 3, 10);
		const next = noteFrameCount(decided, 2, 11);
		assert.equal(next.value, 2);
		assert.equal(next.decisionAt, 10);
	});

	test("an earlier decision does not replace a later one", () => {
		const later = noteDecisionCount(seedApprovalCount(4), 3, 12);
		const next = noteDecisionCount(later, 4, 8);
		assert.equal(next.value, 3);
		assert.equal(next.decisionAt, 12);
	});
});
