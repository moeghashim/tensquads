import assert from "node:assert/strict";
import test from "node:test";

import { AccountBus } from "../src/cloudflare-bus/account-bus.ts";
import { hmacSign } from "../src/cloudflare-bus/hmac.ts";
import { handleMachineRequest } from "../src/cloudflare-bus/http.ts";
import { recordMonitor, resolveMonitor } from "../src/cloudflare-bus/monitors.ts";
import { workerTestBus } from "../src/worker-adapters.ts";
import { Storage } from "./bus-storage.ts";

const now = 1_800_000_000_000;

async function post(account: string | undefined, monitorId: string, secret = "fixture-secret") {
	const stamp = String(now / 1000);
	const body = JSON.stringify({
		id: `cross-${monitorId}`,
		event: "change.detected",
		created_at: new Date(now).toISOString(),
		data: {
			change: {
				monitor_id: monitorId,
				url: "https://example.com",
				title: "price",
				summary: "changed",
			},
		},
	});
	const sig = Buffer.from(await hmacSign(secret, `${stamp}.${body}`)).toString("hex");
	const query = account === undefined ? "" : `?account=${account}`;
	return handleMachineRequest(
		new Request(`https://worker/change.detected${query}`, {
			method: "POST",
			headers: {
				"x-context-signature": `t=${stamp},v1=${sig}`,
				"x-context-event": "change.detected",
			},
			body,
		}),
		{ CONTEXT_WEBHOOK_SECRET: secret, now: () => now },
	);
}

async function count(accountId: string): Promise<number> {
	return (await workerTestBus().events({ accountId, mode: "account" })).length;
}

test("a signed change uses the stored monitor account", async () => {
	await recordMonitor("monitor-a", "victim-a");
	const other = await post("victim-b", "monitor-a");
	assert.equal(other?.status, 400);
	assert.equal(await count("victim-b"), 0);
	assert.equal(await count("victim-a"), 0);

	const unknown = await post("victim-a", "monitor-unknown");
	assert.equal(unknown?.status, 400);
	assert.equal(await count("victim-a"), 0);

	const owned = await post("victim-a", "monitor-a");
	assert.equal(owned?.status, 200);
	assert.equal(await count("victim-a"), 1);
	assert.equal(await count("victim-b"), 0);

	const omitted = await post(undefined, "monitor-a");
	assert.equal(omitted?.status, 200);
	assert.equal(JSON.stringify(await omitted?.json()), JSON.stringify({ ok: true, seen: true }));
	assert.equal(await count("victim-a"), 1);
});

test("a real bus keeps the monitor on the account that recorded it", async () => {
	const storage = new Storage();
	const target = new AccountBus({ storage, acceptWebSocket() {}, getWebSockets: () => [] }, {});
	const namespace = {
		idFromName: (name: string) => name,
		get: () => ({
			fetch(input: Request | string | URL, init?: RequestInit) {
				return target.fetch(new Request(input, init));
			},
		}),
	};
	const env = { ADAPTERS: "real", ACCOUNT_BUS: namespace };
	await recordMonitor("monitor-bus", "bus-account", env);
	assert.equal(await resolveMonitor("monitor-bus", env), "bus-account");
	assert.equal(await resolveMonitor("monitor-missing", env), null);
	await assert.rejects(
		() => recordMonitor("monitor-bus", "other-account", env),
		/The monitor belongs to another account\./,
	);
});
