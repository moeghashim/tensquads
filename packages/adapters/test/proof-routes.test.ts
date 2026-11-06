import assert from "node:assert/strict";
import test from "node:test";

import { AccountBus } from "../src/cloudflare-bus/account-bus.ts";
import { alarmAfterFlush, HEARTBEATS, MISSED_MS, RETRY_MS } from "../src/cloudflare-bus/heartbeat.ts";
import { credentialForMachine, handleMachineRequest } from "../src/cloudflare-bus/http.ts";
import {
	MACHINE_TOKEN_BASE_URL_ENV,
	MACHINE_TOKEN_ENV,
	MACHINE_TOKEN_PLACEHOLDER,
	verifyMachineToken,
} from "../src/cloudflare-bus/token.ts";
import { workerTestBus } from "../src/worker-adapters.ts";
import { Storage } from "./bus-storage.ts";

const KEY = "machine-token-fixture";
const SECRET = "webhook-secret-fixture";

function objectBus(env: ConstructorParameters<typeof AccountBus>[1] = {}) {
	const storage = new Storage();
	const target = new AccountBus({ storage, acceptWebSocket() {}, getWebSockets: () => [] }, env);
	const namespace = {
		idFromName: (name: string) => name,
		get: () => ({
			fetch(input: Request | string | URL, init?: RequestInit) {
				return target.fetch(new Request(input, init));
			},
		}),
	};
	return { storage, target, namespace };
}

async function sign(secret: string, stamp: string, raw: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${stamp}.${raw}`)));
	const hex = [...mac].map((byte) => byte.toString(16).padStart(2, "0")).join("");
	return `t=${stamp},v1=${hex}`;
}

test("alarmAfterFlush picks the earliest deadline", () => {
	assert.equal(alarmAfterFlush(1, 500, 0, 30_000), 500);
	assert.equal(alarmAfterFlush(0, 500, 0, 30_000), 500);
	assert.equal(alarmAfterFlush(0, null, 0, 30_000), null);
	assert.equal(alarmAfterFlush(1, 5_000, 0, 30_000, 12_345), 5_000);
	assert.equal(alarmAfterFlush(1, 20_000, 0, 30_000, 12_345), 12_345);
});

test("the signer matches send, take, and heartbeat for one account and one agent", async () => {
	const now = Date.now();
	const delivery = await credentialForMachine({ MACHINE_TOKEN_KEY: KEY }, "acct-a", "market", now);
	const token = delivery.authorization.slice("Bearer ".length);
	assert.equal(delivery.placeholderEnv, MACHINE_TOKEN_ENV);
	assert.equal(delivery.baseUrlEnv, MACHINE_TOKEN_BASE_URL_ENV);
	assert.equal(delivery.placeholder, MACHINE_TOKEN_PLACEHOLDER);
	assert.notEqual(token, MACHINE_TOKEN_PLACEHOLDER);
	assert.equal(await verifyMachineToken(KEY, token, "acct-a", "market", now), true);
	const day = 24 * 60 * 60 * 1000;
	assert.equal(await verifyMachineToken(KEY, token, "acct-a", "market", now + 29 * day), true);
	assert.equal(await verifyMachineToken(KEY, token, "acct-a", "market", now + 30 * day), false);
	assert.equal(await verifyMachineToken(KEY, token, "acct-b", "market", now), false);
	assert.equal(await verifyMachineToken(KEY, token, "acct-a", "website", now), false);
	await assert.rejects(
		() => credentialForMachine({}, "acct-a", "market", now),
		/The machine service is not configured\./,
	);

	const event = {
		id: "poc-send-1",
		from: "market",
		to: "master",
		kind: "Task",
		skill: "task.route",
		text: "Research this business.",
		payload: {},
		writes: [],
	};
	const headers = { authorization: delivery.authorization };
	const sent = await handleMachineRequest(
		new Request("https://worker/machine/send", {
			method: "POST",
			headers,
			body: JSON.stringify({ accountId: "acct-a", agentId: "market", event }),
		}),
		{ MACHINE_TOKEN_KEY: KEY },
	);
	assert.equal(sent?.status, 200);
	const taken = await handleMachineRequest(
		new Request("https://worker/machine/take", {
			method: "POST",
			headers,
			body: JSON.stringify({ accountId: "acct-a", agentId: "market" }),
		}),
		{ MACHINE_TOKEN_KEY: KEY },
	);
	assert.equal(taken?.status, 200);
	assert.equal(Array.isArray(await taken?.json()), true);
	const { namespace, storage } = objectBus();
	const beat = await handleMachineRequest(
		new Request("https://worker/machine/heartbeat", {
			method: "POST",
			headers,
			body: JSON.stringify({ accountId: "acct-a", agentId: "market" }),
		}),
		{ MACHINE_TOKEN_KEY: KEY, ACCOUNT_BUS: namespace },
	);
	assert.equal(beat?.status, 200);
	assert.equal(JSON.stringify(await beat?.json()), JSON.stringify({ ok: true }));
	const beats = await storage.get<Record<string, { at: number }>>(HEARTBEATS);
	assert.equal(typeof beats?.market?.at, "number");
	const missingBus = await handleMachineRequest(
		new Request("https://worker/machine/heartbeat", {
			method: "POST",
			headers,
			body: JSON.stringify({ accountId: "acct-a", agentId: "market" }),
		}),
		{ MACHINE_TOKEN_KEY: KEY },
	);
	assert.equal(missingBus?.status, 503);
	assert.equal(await missingBus?.text(), "The machine service is not configured.");
	const minted = await handleMachineRequest(new Request("https://worker/machine/token", { method: "POST" }), {
		MACHINE_TOKEN_KEY: KEY,
	});
	assert.equal(minted, null);
});

test("three missed minutes resume the agent once", async () => {
	let now = 0;
	const resumed: string[] = [];
	const { target, storage } = objectBus({
		now: () => now,
		resumeAgent: async (_accountId, agentId) => {
			resumed.push(agentId);
		},
	});
	const post = () =>
		target.fetch(
			new Request("https://bus/heartbeat", {
				method: "POST",
				body: JSON.stringify({ accountId: "proof", agentId: "website" }),
			}),
		);
	assert.equal((await post()).status, 200);
	now = MISSED_MS - 1;
	await target.alarm();
	assert.deepEqual(resumed, []);
	now = MISSED_MS;
	await target.alarm();
	assert.deepEqual(resumed, ["website"]);
	const beats = await storage.get<Record<string, { at: number; resumedAt?: number }>>(HEARTBEATS);
	assert.equal(beats?.website?.resumedAt, MISSED_MS);
	assert.equal(await storage.getAlarm(), null);
	now = 120_000;
	assert.equal((await post()).status, 200);
	now = MISSED_MS;
	await target.alarm();
	assert.deepEqual(resumed, ["website"]);
	assert.equal(await storage.getAlarm(), 120_000 + MISSED_MS);
});

test("a failed resume waits one minute and test mode does not call boat", async () => {
	let now = 0;
	const failing = objectBus({
		now: () => now,
		resumeAgent: async () => {
			throw new Error("The machine did not resume.");
		},
	});
	await failing.target.fetch(
		new Request("https://bus/heartbeat", {
			method: "POST",
			body: JSON.stringify({ accountId: "proof", agentId: "website" }),
		}),
	);
	now = MISSED_MS;
	await failing.target.alarm();
	assert.equal(await failing.storage.getAlarm(), MISSED_MS + RETRY_MS);
	const beats = await failing.storage.get<Record<string, { resumedAt?: number }>>(HEARTBEATS);
	assert.equal(beats?.website?.resumedAt, undefined);

	let quietNow = 0;
	const quiet = objectBus({ now: () => quietNow });
	await quiet.target.fetch(
		new Request("https://bus/heartbeat", {
			method: "POST",
			body: JSON.stringify({ accountId: "proof", agentId: "market" }),
		}),
	);
	quietNow = MISSED_MS;
	await quiet.target.alarm();
	assert.equal(await quiet.storage.getAlarm(), null);
});

test("a signed change.detected webhook becomes one bus event", async () => {
	const now = Date.parse("2026-11-05T12:00:00.000Z");
	const body = JSON.stringify({
		id: "evt-proof-1",
		event: "change.detected",
		created_at: "2026-11-05T12:00:00.000Z",
		data: {
			change: {
				monitor_id: "mon-proof",
				url: "https://example.com/alpha",
				title: "Alpha Grill",
				summary: "The price changed.",
				excerpts: ["$13"],
			},
		},
	});
	const stamp = String(Math.floor(now / 1000));
	const headers = {
		"x-context-signature": await sign(SECRET, stamp, body),
		"x-context-event": "change.detected",
		"x-context-id": "evt-proof-1",
		"user-agent": "Context.dev-Webhooks/1.0",
	};
	const env = { MACHINE_TOKEN_KEY: KEY, now: () => now };
	const account = "change-proof";
	const delivery = await credentialForMachine({ MACHINE_TOKEN_KEY: KEY }, account, "market", now);
	const stored = await handleMachineRequest(
		new Request("https://worker/machine/monitor", {
			method: "POST",
			headers: { authorization: delivery.authorization },
			body: JSON.stringify({ accountId: account, agentId: "market", monitorId: "mon-proof", secret: SECRET }),
		}),
		env,
	);
	assert.equal(stored?.status, 200);
	const post = (init: RequestInit, id = account) =>
		handleMachineRequest(new Request(`https://worker/change.detected?account=${id}`, init), env);
	const first = await post({ method: "POST", headers, body });
	assert.equal(first?.status, 200);
	assert.equal(JSON.stringify(await first?.json()), JSON.stringify({ ok: true }));
	const events = await workerTestBus().events({ accountId: account, mode: "account" });
	assert.equal(events.length, 1);
	assert.equal(events[0]?.kind, "Request");
	assert.equal(events[0]?.from, "context");
	assert.equal(events[0]?.to, "master");
	assert.equal(events[0]?.skill, "change.detected");
	assert.equal(events[0]?.id, "evt-proof-1");
	const second = await post({ method: "POST", headers, body });
	assert.equal(JSON.stringify(await second?.json()), JSON.stringify({ ok: true, seen: true }));
	assert.equal((await workerTestBus().events({ accountId: account, mode: "account" })).length, 1);

	const stale = await post(
		{
			method: "POST",
			headers: { ...headers, "x-context-signature": await sign(SECRET, String(Number(stamp) - 301), body) },
			body,
		},
		"change-stale",
	);
	assert.equal(stale?.status, 400);
	const bad = await post(
		{ method: "POST", headers: { ...headers, "x-context-signature": "t=1,v1=ab" }, body: "not-json" },
		"change-bad",
	);
	assert.equal(bad?.status, 400);
	const wrong = await post(
		{ method: "POST", headers: { ...headers, "x-context-event": "page.changed" }, body },
		"change-wrong",
	);
	assert.equal(wrong?.status, 400);
	const unknownBody = JSON.stringify({
		...JSON.parse(body),
		data: { change: { ...JSON.parse(body).data.change, monitor_id: "mon-unregistered" } },
	});
	const missing = await handleMachineRequest(
		new Request(`https://worker/change.detected?account=${account}`, {
			method: "POST",
			headers: { ...headers, "x-context-signature": await sign(SECRET, stamp, unknownBody) },
			body: unknownBody,
		}),
		{ now: () => now },
	);
	assert.equal(missing?.status, 400);
	assert.equal(await missing?.text(), "The message was rejected.");
	assert.equal((await workerTestBus().events({ accountId: "change-stale", mode: "account" })).length, 0);
	assert.equal((await workerTestBus().events({ accountId: "change-bad", mode: "account" })).length, 0);
	assert.equal((await workerTestBus().events({ accountId: "change-wrong", mode: "account" })).length, 0);
});
