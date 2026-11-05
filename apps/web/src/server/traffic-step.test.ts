import assert from "node:assert/strict";
import test from "node:test";

import { trafficScript } from "@tensquads/adapters";
import type { PublishedEvent } from "@tensquads/kernel";
import { consumeQueuedEvent, registerTrafficAdvance, runLiveTick, sendNextEvent } from "#/workspace/live.ts";

import { advanceTrafficAccount, realTrafficBus } from "./traffic-step.ts";

const event: PublishedEvent = {
	id: "e100",
	from: "master",
	to: "researcher",
	kind: "Task",
	skill: "research",
	text: "Look at the market.",
	payload: {},
	writes: [],
};

test("real mode traffic advances through the bus and test mode keeps the repository", async () => {
	const previous = process.env.ADAPTERS;
	let busCalls = 0;
	const bus = {
		async events() {
			return [];
		},
		async store() {
			return {};
		},
		async publish() {
			return undefined;
		},
		async nextEvent() {
			busCalls += 1;
			return event;
		},
	};
	try {
		process.env.ADAPTERS = "real";
		const advanced = await advanceTrafficAccount(
			{} as never,
			{ accountId: "acct", mode: "account" },
			Date.now(),
			bus,
		);
		assert.equal(advanced, "e100");
		assert.equal(busCalls, 1);
		const script = trafficScript();
		const published: PublishedEvent[] = [];
		const namespace = {
			idFromName: (name: string) => name,
			get: () => ({
				async fetch(input: Request | string | URL, init?: RequestInit) {
					const request = new Request(input, init);
					assert.equal(new URL(request.url).pathname, "/advance");
					const body = (await request.json()) as { script?: { text?: string }[] };
					assert.equal(body.script?.[0]?.text, script[0]?.text);
					assert.equal(body.script?.[1]?.text, script[1]?.text);
					const step = body.script?.[published.length];
					if (!step?.text) return Response.json({ accepted: false });
					const planned: PublishedEvent = {
						id: `e${100 + published.length}`,
						from: "master",
						to: "inventory",
						kind: "Task",
						skill: "shopify.stock_levels",
						text: step.text,
						payload: {},
						writes: [],
					};
					published.push(planned);
					return Response.json({ accepted: true, event: planned });
				},
			}),
		};
		const durable = realTrafficBus({ ACCOUNT_BUS: namespace });
		const scope = { accountId: "acct", mode: "account" } as const;
		registerTrafficAdvance(() => advanceTrafficAccount({} as never, scope, Date.now(), durable));
		await runLiveTick({
			accountId: scope.accountId,
			live: true,
			refresh: () => undefined,
		});
		const liveId = consumeQueuedEvent();
		await sendNextEvent(() => undefined, scope.accountId);
		const simulateId = consumeQueuedEvent();
		assert.equal(liveId, "e100");
		assert.equal(simulateId, "e101");
		assert.equal(published[0]?.text, script[0]?.text);
		assert.equal(published[1]?.text, script[1]?.text);
		assert.equal(script[0]?.text, "Daily stock check");
		process.env.ADAPTERS = "test";
		busCalls = 0;
		await assert.rejects(() =>
			advanceTrafficAccount(
				new Proxy({} as object, {
					get() {
						throw new Error("test mode read the database");
					},
				}) as never,
				{ accountId: "acct", mode: "account" },
				Date.now(),
				bus,
			),
		);
		assert.equal(busCalls, 0);
	} finally {
		if (previous === undefined) delete process.env.ADAPTERS;
		else process.env.ADAPTERS = previous;
	}
});
