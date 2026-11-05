import assert from "node:assert/strict";
import test from "node:test";

import { alarmAfterFlush, HEARTBEAT_ALARM, recordBeat, sweepHeartbeats } from "../src/cloudflare-bus/heartbeat.ts";
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

test("market at 0 ms and website at 60,000 ms keep the earlier alarm", async () => {
	const storage = new Storage();
	await recordBeat(storage, "market", 0);
	await recordBeat(storage, "website", 60_000);
	const due = await storage.get(HEARTBEAT_ALARM);
	const next = alarmAfterFlush(0, due, 60_000, 60_000);
	assert.equal(due, 180_000);
	assert.equal(next, 180_000);
	if (next !== null) await storage.setAlarm(next);
	assert.equal(await storage.getAlarm(), 180_000);
});
