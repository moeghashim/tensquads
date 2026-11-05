import assert from "node:assert/strict";
import test from "node:test";

import { AccountBus } from "../src/cloudflare-bus/account-bus.ts";
import { createCloudflareBus } from "../src/cloudflare-bus/http.ts";
import { Storage } from "./bus-storage.ts";

const scope = { accountId: "deadline-account", mode: "account" } as const;
const script = [
	{
		from: "master",
		to: "inventory",
		kind: "Task" as const,
		skill: "stock",
		text: "Check stock",
		payload: {},
		writes: [],
		set: { stock: 1 },
	},
];
const unfinished = "The workspace write did not finish.";

function fixture(storage = new Storage()) {
	const target = new AccountBus({ storage, acceptWebSocket() {}, getWebSockets: () => [] }, {});
	const responses: unknown[] = [];
	const bodies: Record<string, unknown>[] = [];
	const namespace = {
		idFromName: (id: string) => id,
		get: () => ({
			async fetch(input: Request | string | URL, init?: RequestInit) {
				const request = new Request(input, init);
				bodies.push((await request.clone().json()) as Record<string, unknown>);
				const response = await target.fetch(request);
				assert.equal(response.status, 200);
				responses.push(await response.clone().json());
				return response;
			},
		}),
	};
	const queue = {
		async send() {
			assert.fail("An advance must not enqueue before acceptance.");
		},
	};
	return { storage, responses, bodies, bus: createCloudflareBus(namespace, script, queue), namespace };
}

function noStep(storage: Storage) {
	assert.equal(
		[...storage.rows.keys()].some((key) => key.startsWith("event:") || key.startsWith("seen:")),
		false,
	);
	assert.equal(storage.rows.has("traffic-cursor"), false);
	assert.equal(storage.rows.has("state:stock"), false);
	assert.equal(storage.alarm, null);
}

test("an expired advance rejects before initialization and writes no step", async (t) => {
	const f = fixture();
	const get = t.mock.method(f.storage, "get");
	await assert.rejects(f.bus.nextEvent(scope, Date.now() - 1), { message: unfinished });
	assert.deepEqual(f.responses, [{ accepted: false, expired: true }]);
	assert.equal(get.mock.callCount(), 0);
	noStep(f.storage);
});

test("expiry during the initialization seq read rejects without committing a step", async (t) => {
	const f = fixture();
	let seqReads = 0;
	const original = f.storage.get.bind(f.storage);
	t.mock.method(f.storage, "get", async <T>(key: string): Promise<T | undefined> => {
		if (key === "seq") {
			seqReads += 1;
			await new Promise((resolve) => setTimeout(resolve, 400));
		}
		return original<T>(key);
	});
	await assert.rejects(f.bus.nextEvent(scope, Date.now() + 250), { message: unfinished });
	assert.ok(seqReads >= 1);
	assert.deepEqual(f.responses, [{ accepted: false, expired: true }]);
	noStep(f.storage);
});

test("future and omitted deadlines accept successive steps without enqueueing", async () => {
	const f = fixture();
	assert.equal((await f.bus.nextEvent(scope, Date.now() + 60_000))?.id, "e100");
	assert.equal((await f.bus.nextEvent(scope))?.id, "e101");
	assert.equal(Object.hasOwn(f.bodies[1] ?? {}, "deadlineAt"), false);
	const empty = createCloudflareBus(f.namespace, []);
	assert.equal(await empty.nextEvent(scope), undefined);
	assert.deepEqual(f.responses.at(-1), { accepted: false });
});

test("nonfinite deadlines are omitted from the advance protocol", async () => {
	const f = fixture();
	for (const deadline of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
		assert.ok(await f.bus.nextEvent(scope, deadline));
		assert.equal(Object.hasOwn(f.bodies.at(-1) ?? {}, "deadlineAt"), false);
	}
});
