import assert from "node:assert/strict";
import test from "node:test";
import type { PublishedEvent } from "@tensquads/kernel";
import { AccountBus } from "../src/cloudflare-bus/account-bus.ts";
import { createCloudflareBus } from "../src/cloudflare-bus/http.ts";
import type { ScriptedBusEvent } from "../src/memory-bus.ts";
import { Storage } from "./bus-storage.ts";

const scope = { accountId: "bus-recovery", mode: "account" } as const;
const event: PublishedEvent = {
	id: "valid",
	from: "master",
	to: "researcher",
	kind: "Task",
	skill: "research",
	text: "Look at the market.",
	payload: {},
	writes: [],
};

const script: ScriptedBusEvent[] = ["First", "Second"].map((text) => ({
	from: event.from,
	to: event.to,
	kind: "Task",
	skill: event.skill,
	text,
	payload: event.payload,
	writes: event.writes,
}));

function bus(storage: Storage, database?: string) {
	return new AccountBus({ storage, acceptWebSocket() {}, getWebSockets: () => [] }, { DATABASE_URL: database });
}

test("two concurrent advances on one account never both succeed for one event", async () => {
	const storage = new Storage();
	const target = bus(storage);
	const sent: string[] = [];
	const namespace = {
		idFromName: (id: string) => id,
		get: () => ({
			fetch(input: Request | string | URL, init?: RequestInit) {
				return target.fetch(new Request(input, init));
			},
		}),
	};
	const queue = {
		async send(body: { event: PublishedEvent }) {
			sent.push(body.event.id);
		},
	};
	const concurrent = { accountId: "bus-concurrent", mode: "account" } as const;
	const first = createCloudflareBus(namespace, script, queue);
	const second = createCloudflareBus(namespace, script, queue);
	const results = await Promise.all([first.nextEvent(concurrent), second.nextEvent(concurrent)]);
	const ids = results.map((row) => row?.id ?? "nothing new");
	const accepted = ids.filter((id) => id !== "nothing new");
	assert.equal(new Set(accepted).size, accepted.length);
	assert.equal(accepted.includes("e100"), true);
	assert.equal(ids.filter((id) => id === "e100").length, 1);
	const other = ids.find((id) => id !== "e100");
	assert.equal(other === "e101" || other === "nothing new", true);
	const stored = [...(await storage.list<PublishedEvent>({ prefix: "event:" })).values()].map((event) => event.id);
	for (const id of accepted) assert.equal(stored.includes(id), true);
	assert.equal(sent.length, 0);
});

test("a recreated adapter advances when the history read still lags", async () => {
	const storage = new Storage();
	const target = bus(storage);
	const namespace = {
		idFromName: (id: string) => id,
		get: () => ({
			async fetch(input: Request | string | URL, init?: RequestInit) {
				if (String(input).endsWith("/events")) return Response.json([]);
				return target.fetch(new Request(input, init));
			},
		}),
	};
	const first = createCloudflareBus(namespace, script);
	const recreated = createCloudflareBus(namespace, script);
	const results = await Promise.all([first.nextEvent(scope), recreated.nextEvent(scope)]);
	assert.deepEqual(
		results.map((row) => row?.id),
		["e100", "e101"],
	);
	const next = await recreated.nextEvent(scope);
	assert.equal(next?.id, "e102");
	assert.equal(next?.text, "First");
	assert.equal(await storage.get("seq"), 3);
});
