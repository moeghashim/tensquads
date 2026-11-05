import assert from "node:assert/strict";
import test from "node:test";

import { recordBeat, sweepHeartbeats } from "../src/cloudflare-bus/heartbeat.ts";
import { Storage } from "./bus-storage.ts";

test("a successful resume waits for a new heartbeat", async () => {
	const storage = new Storage();
	await storage.put("account", "a");
	await recordBeat(storage, "market", 0);
	const calls: string[] = [];
	for (const now of [180_000, 360_000, 540_000]) {
		await sweepHeartbeats(storage, {
			now: () => now,
			resumeAgent: async (accountId, agentId) => {
				calls.push(`${accountId}/${agentId}`);
			},
		});
	}
	assert.deepEqual(calls, ["a/market"]);
	assert.equal(await storage.getAlarm(), null);
});
