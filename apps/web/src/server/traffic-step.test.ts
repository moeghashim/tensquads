import assert from "node:assert/strict";
import test from "node:test";

import type { PublishedEvent } from "@tensquads/kernel";
import { advanceTrafficAccount } from "./traffic-step.ts";

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
