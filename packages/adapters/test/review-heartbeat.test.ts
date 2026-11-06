import assert from "node:assert/strict";
import test from "node:test";

import { setDeadline } from "../src/cloudflare-bus/alarm.ts";
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

test("a failed resume retries from its finish time", async () => {
	const storage = new Storage();
	await storage.put("account", "a");
	await storage.put("heartbeats", { market: { at: 0 } });
	let now = 180_000;
	await sweepHeartbeats(storage, {
		now: () => now,
		resumeAgent: async () => {
			now = 300_000;
			throw new Error("resume failed");
		},
	});
	assert.equal(await storage.get(HEARTBEAT_ALARM), 360_000);
	assert.equal(await storage.getAlarm(), 360_000);
});

test("a beat accepted during a resume stays in the map", async () => {
	const storage = new Storage();
	await storage.put("account", "a");
	await storage.put("heartbeats", { market: { at: 0 } });
	await sweepHeartbeats(storage, {
		now: () => 200_000,
		resumeAgent: async () => {
			await recordBeat(storage, "website", 190_000);
		},
	});
	const map = (await storage.get<Record<string, { at: number; resumedAt?: number }>>("heartbeats")) ?? {};
	assert.equal(map.website?.at, 190_000);
	assert.equal(map.market?.resumedAt, 200_000);
});

test("an empty heartbeat map clears its alarm", async () => {
	const storage = new Storage();
	await setDeadline(storage, HEARTBEAT_ALARM, 500);
	await sweepHeartbeats(storage, { now: () => 500 });
	assert.equal(await storage.get(HEARTBEAT_ALARM), undefined);
	assert.equal(await storage.getAlarm(), null);
});

test("a heartbeat armed while the map is read is kept", async () => {
	const storage = new Storage();
	await setDeadline(storage, HEARTBEAT_ALARM, 500);
	const original = storage.get.bind(storage);
	storage.get = async <T>(key: string) => {
		const value = await original<T>(key);
		if (key === "heartbeats") await setDeadline(storage, HEARTBEAT_ALARM, 9_000);
		return value;
	};
	await sweepHeartbeats(storage, { now: () => 1_000 });
	assert.equal(await storage.get(HEARTBEAT_ALARM), 9_000);
	assert.equal(await storage.getAlarm(), 9_000);
});
