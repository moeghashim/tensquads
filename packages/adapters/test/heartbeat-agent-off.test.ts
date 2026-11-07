import assert from "node:assert/strict";
import test from "node:test";

import { HEARTBEATS, RETRY_MS, recordBeat, sweepHeartbeats } from "../src/cloudflare-bus/heartbeat.ts";
import { Storage } from "./bus-storage.ts";

test("the heartbeat does not resume a machine whose agent is off", async () => {
	const storage = new Storage();
	await storage.put("account", "a");
	await recordBeat(storage, "market", 0);
	const resumed: string[] = [];
	const checked: string[] = [];
	await sweepHeartbeats(storage, {
		now: () => 180_000,
		agentOn: async (accountId, agentId) => {
			checked.push(`${accountId}/${agentId}`);
			return false;
		},
		resumeAgent: async (accountId, agentId) => {
			resumed.push(`${accountId}/${agentId}`);
		},
	});
	assert.deepEqual(checked, ["a/market"]);
	assert.deepEqual(resumed, []);
	assert.equal(await storage.getAlarm(), null);
});

test("a skipped beat waits for the next beat before it can fire again", async () => {
	const storage = new Storage();
	await storage.put("account", "a");
	await recordBeat(storage, "market", 0);
	const resumed: string[] = [];
	const sweepWith = (now: number, on: boolean) =>
		sweepHeartbeats(storage, {
			now: () => now,
			agentOn: async () => on,
			resumeAgent: async (_accountId, agentId) => {
				resumed.push(agentId);
			},
		});
	await sweepWith(180_000, false);
	await sweepWith(360_000, true);
	assert.deepEqual(resumed, []);

	await recordBeat(storage, "market", 400_000);
	await sweepWith(580_000, true);
	assert.deepEqual(resumed, ["market"]);
});

test("switching an agent back on lets the heartbeat resume its machine", async () => {
	const storage = new Storage();
	await storage.put("account", "a");
	await recordBeat(storage, "market", 0);
	const resumed: string[] = [];
	await sweepHeartbeats(storage, {
		now: () => 180_000,
		agentOn: async () => true,
		resumeAgent: async (_accountId, agentId) => {
			resumed.push(agentId);
		},
	});
	assert.deepEqual(resumed, ["market"]);
	assert.equal(await storage.getAlarm(), null);
});

test("a failed switch check retries, and does not resume the machine", async () => {
	const storage = new Storage();
	await storage.put("account", "a");
	await recordBeat(storage, "market", 0);
	const resumed: string[] = [];
	await sweepHeartbeats(storage, {
		now: () => 180_000,
		agentOn: async () => {
			throw new Error("database unavailable");
		},
		resumeAgent: async (_accountId, agentId) => {
			resumed.push(agentId);
		},
	});
	assert.deepEqual(resumed, []);
	assert.equal(await storage.getAlarm(), 180_000 + RETRY_MS);
	const beats = await storage.get<Record<string, { resumedAt?: number }>>(HEARTBEATS);
	assert.equal(beats?.market?.resumedAt, undefined);
});
