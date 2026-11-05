import assert from "node:assert/strict";
import test from "node:test";

import { MachineFault, type PublishedEvent } from "@tensquads/kernel";

import { createCloudflareBus, handleBusQueue, handleMachineRequest } from "../src/cloudflare-bus/http.ts";
import { signMachineToken } from "../src/cloudflare-bus/token.ts";

const scope = { accountId: "acct-queue", mode: "account" } as const;
const event: PublishedEvent = {
	id: "task-1",
	from: "researcher",
	to: "researcher",
	kind: "Task",
	skill: "research",
	text: "Look at the market.",
	payload: {},
	writes: [],
};

test("a real publication waits on the queue until the consumer accepts it", async () => {
	const fetches: string[] = [];
	const sent: unknown[] = [];
	const namespace = {
		idFromName: (name: string) => name,
		get: () => ({
			async fetch(input: Request | string | URL, init?: RequestInit) {
				const request = new Request(input, init);
				const path = new URL(request.url).pathname;
				fetches.push(path);
				if (path === "/events") return Response.json([]);
				if (path === "/advance") {
					const body = (await request.json()) as { script?: { text?: string }[] };
					return Response.json({
						accepted: true,
						event: {
							id: "e100",
							from: "master",
							to: "researcher",
							kind: "Task",
							skill: "research",
							text: body.script?.[0]?.text ?? "",
							payload: {},
							writes: [],
						},
					});
				}
				return Response.json({ seen: false });
			},
		}),
	};
	const queue = {
		async send(body: unknown) {
			sent.push(body);
		},
	};
	const bus = createCloudflareBus(
		namespace,
		[
			{
				from: "master",
				to: "researcher",
				kind: "Task",
				skill: "research",
				text: "Next.",
				payload: {},
				writes: [],
			},
		],
		queue,
	);
	await bus.publish(scope, event);
	assert.deepEqual(fetches, []);
	assert.deepEqual(sent, [{ accountId: scope.accountId, event }]);

	await handleBusQueue(
		{
			queue: "tensquads-bus",
			messages: [{ id: "m1", body: sent[0], ack() {} }],
		},
		{ ADAPTERS: "real", ACCOUNT_BUS: namespace },
	);
	assert.deepEqual(fetches, ["/accept"]);
	fetches.length = 0;

	const scripted = await bus.nextEvent(scope);
	assert.equal(scripted?.id, "e100");
	assert.equal(scripted?.text, "Next.");
	assert.deepEqual(fetches, ["/advance"]);
	assert.equal(sent.length, 1);

	const key = "queue-key";
	const token = await signMachineToken(key, scope.accountId, "researcher", Math.floor(Date.now() / 1000) + 60);
	const response = await handleMachineRequest(
		new Request("https://worker/machine/send", {
			method: "POST",
			headers: { authorization: `Bearer ${token}` },
			body: JSON.stringify({ accountId: scope.accountId, agentId: "researcher", event }),
		}),
		{ ADAPTERS: "real", ACCOUNT_BUS: namespace, MACHINE_TOKEN_KEY: key, BUS_QUEUE: queue },
	);
	assert.equal(response?.status, 200);
	assert.deepEqual(fetches, ["/advance"]);
	assert.equal(sent.length, 2);
	await assert.rejects(
		() =>
			handleMachineRequest(
				new Request("https://worker/machine/send", {
					method: "POST",
					headers: { authorization: `Bearer ${token}` },
					body: JSON.stringify({ accountId: scope.accountId, agentId: "researcher", event }),
				}),
				{ ADAPTERS: "real", ACCOUNT_BUS: namespace, MACHINE_TOKEN_KEY: key },
			),
		(error: unknown) => error instanceof MachineFault && error.message === "The bus is not configured.",
	);
});
