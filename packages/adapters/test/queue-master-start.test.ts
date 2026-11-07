import assert from "node:assert/strict";
import test from "node:test";

import type { BusinessChat } from "@tensquads/domain";
import type { PublishedEvent } from "@tensquads/kernel";
import { type BusBatch, handleBusQueue, type QueueMessage, type WorkerBindings } from "../src/cloudflare-bus/http.ts";
import { queueMasterStart } from "../src/cloudflare-bus/master-start.ts";
import type { ProvisionedAgent } from "../src/provision-agents.ts";

const request: BusinessChat = {
	businessName: "Proof Kitchen",
	businessType: "restaurant",
	cuisine: "Levantine",
	items: [{ name: "Chicken tawook", price: "14", section: "Mains" }],
};

function batch(body: unknown, acked: { count: number }): BusBatch {
	return {
		queue: "tensquads-real-bus",
		messages: [{ id: "m1", body, ack: () => (acked.count += 1) }],
	};
}

test("queueing a start only sends the start message", async () => {
	const sent: QueueMessage[] = [];
	// The send gets only the queue. It has no provisioning hook, so it cannot wait on provisioning.
	const queue = {
		async send(message: QueueMessage) {
			sent.push(message);
		},
	};
	await queueMasterStart(queue, "acct-queued", request);
	assert.deepEqual(sent, [{ accountId: "acct-queued", start: request }]);
});

test("the queue consumer provisions once with the stored expiry map and publishes the Task", async () => {
	const accepted: PublishedEvent[] = [];
	const provisionCalls: { accountId: string; currentExp: Record<string, number> }[] = [];
	const namespace = {
		idFromName: (id: string) => id,
		get: () => ({
			async fetch(input: Request | string | URL, init?: RequestInit) {
				const path = new URL(String(input)).pathname;
				if (path === "/store") return Response.json({ machineExp: { market: 9999 } });
				if (path === "/accept") {
					const body = JSON.parse(String(init?.body)) as { event: PublishedEvent };
					accepted.push(body.event);
					return Response.json({ seen: false, seq: 1 });
				}
				return new Response("missing", { status: 404 });
			},
		}),
	};
	const env: WorkerBindings = {
		ADAPTERS: "real",
		ACCOUNT_BUS: namespace,
		provisionAgents: async (_env, accountId, _nowMs, currentExp = {}) => {
			provisionCalls.push({ accountId, currentExp: { ...currentExp } });
			const rows: ProvisionedAgent[] = [
				{ agentId: "market", rotated: false, exp: 10001, profile: "", snapshot: "" },
			];
			return rows;
		},
	};
	const acked = { count: 0 };
	await handleBusQueue(batch({ accountId: "acct-queued", start: request }, acked), env);

	assert.equal(acked.count, 1);
	assert.deepEqual(provisionCalls, [{ accountId: "acct-queued", currentExp: { market: 9999 } }]);
	assert.equal(accepted.length, 1);
	assert.equal(accepted[0]?.kind, "Task");
	assert.equal(accepted[0]?.id, "business-acct-queued");
	assert.deepEqual(accepted[0]?.set?.machineExp, { market: 10001 });
});

test("a start message with an invalid request is rejected and not acked", async () => {
	const acked = { count: 0 };
	const env: WorkerBindings = { ADAPTERS: "real" };
	await assert.rejects(
		() => handleBusQueue(batch({ accountId: "acct-bad", start: { businessName: "" } }, acked), env),
		/The message was rejected\./,
	);
	assert.equal(acked.count, 0);
});
