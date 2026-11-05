import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { currentWrites } from "#/workspace/approval-count.ts";
import { clearFrameHold, frameEpoch, loadHeldFrame } from "#/workspace/frame-load.ts";
import type { WorkspaceFrameData } from "#/workspace/types.ts";

import { publishedTrafficSnapshot, publishTrafficEvent, trafficAccountGeneration } from "./published.ts";
import type { TrafficEvent } from "./view.ts";

describe("published traffic account reset", { concurrency: false }, () => {
	test("an A event published then account B accepted through loadHeldFrame leaves no A entry", async () => {
		clearFrameHold();
		await loadHeldFrame(frameEpoch(), currentWrites(), async () => frame("A"));
		publishTrafficEvent("A", event("a-event", "from A"), trafficAccountGeneration());
		assert.equal(
			publishedTrafficSnapshot().some((row) => row.event.id === "a-event"),
			true,
		);
		await loadHeldFrame(frameEpoch(), currentWrites(), async () => frame("B"));
		assert.equal(
			publishedTrafficSnapshot().some((row) => row.accountId === "A" || row.event.id === "a-event"),
			false,
		);
	});

	test("a late A response after B is not retained", async () => {
		clearFrameHold();
		await loadHeldFrame(frameEpoch(), currentWrites(), async () => frame("A"));
		const generation = trafficAccountGeneration();
		await loadHeldFrame(frameEpoch(), currentWrites(), async () => frame("B"));
		assert.equal(publishTrafficEvent("A", event("late-a", "late"), generation), false);
		assert.equal(
			publishedTrafficSnapshot().some((row) => row.event.id === "late-a"),
			false,
		);
		assert.equal(publishTrafficEvent("B", event("b-event"), trafficAccountGeneration()), true);
		assert.equal(
			publishedTrafficSnapshot().some((row) => row.event.id === "b-event"),
			true,
		);
		assert.equal(
			publishedTrafficSnapshot().some((row) => row.event.id === "late-a"),
			false,
		);
	});
});

function event(id: string, text = id): TrafficEvent {
	return {
		id,
		time: "t",
		from: "inventory",
		to: "master",
		kind: "Task",
		skill: "shopify.stock",
		text,
		payload: {},
		writes: [],
		trace: "tr",
	};
}

function frame(accountId: string): WorkspaceFrameData {
	return {
		accountId,
		accountName: accountId,
		owner: "Moe",
		masterName: "Master",
		squadCount: 1,
		superAdmin: false,
		agents: [],
		approvalCount: 0,
		messages: [],
	};
}
