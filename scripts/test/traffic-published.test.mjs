import assert from "node:assert/strict";
import test from "node:test";

import {
	pendingTrafficId,
	publishedTrafficSnapshot,
	publishTrafficEvent,
	retirePublishedTraffic,
	shownTrafficEvents,
	trafficAccountGeneration,
	watchTrafficAccount,
} from "../../apps/web/src/screens/traffic/published.ts";

function event(id, text = id) {
	return {
		id,
		time: "t",
		from: "inventory",
		to: "master",
		kind: "Task",
		skill: "shopify.stock",
		text,
		payload: {},
		writes: [],
		trace: "tr",
	};
}

const seeded = [event("e1", "old"), event("e2", "older")];

test("a read that started before the send keeps the new event", () => {
	const pending = [{ accountId: "acct", event: event("e100", "Daily stock check"), writeAt: 1 }];
	const shown = shownTrafficEvents({ accountId: "acct", events: seeded, writeAt: 0 }, pending);
	assert.equal(shown.at(-1).id, "e100");
	assert.equal(shown.at(-1).text, "Daily stock check");
});

test("a read started with the send uses the server list", () => {
	const pending = [{ accountId: "acct", event: event("e100", "Daily stock check"), writeAt: 1 }];
	const server = [...seeded, event("e100", "Daily stock check")];
	const shown = shownTrafficEvents({ accountId: "acct", events: server, writeAt: 1 }, pending);
	assert.equal(shown, server);
});

test("another account's event is not appended", () => {
	const pending = [{ accountId: "other", event: event("e100"), writeAt: 1 }];
	const shown = shownTrafficEvents({ accountId: "acct", events: seeded, writeAt: 0 }, pending);
	assert.equal(shown, seeded);
	assert.equal(pendingTrafficId("acct", pending), "");
	assert.equal(pendingTrafficId("other", pending), "e100");
});

test("publish records the event after the write counter moves", () => {
	publishTrafficEvent("acct", event("e100", "Daily stock check"), trafficAccountGeneration());
	const item = publishedTrafficSnapshot().at(-1);
	assert.equal(item.accountId, "acct");
	assert.equal(item.event.text, "Daily stock check");
	assert.equal(item.writeAt > 0, true);
	const shown = shownTrafficEvents(
		{ accountId: "acct", events: seeded, writeAt: item.writeAt - 1 },
		publishedTrafficSnapshot(),
	);
	assert.equal(shown.at(-1).id, "e100");
	const settled = shownTrafficEvents(
		{ accountId: "acct", events: [...seeded, item.event], writeAt: item.writeAt },
		publishedTrafficSnapshot(),
	);
	assert.equal(settled.filter((row) => row.id === "e100").length, 1);
	retirePublishedTraffic("acct", seeded, item.writeAt);
	assert.equal(
		publishedTrafficSnapshot().some((row) => row.event.id === "e100"),
		true,
	);
	retirePublishedTraffic("acct", [...seeded, item.event], item.writeAt);
	assert.equal(
		publishedTrafficSnapshot().some((row) => row.event.id === "e100"),
		false,
	);
	watchTrafficAccount("acct");
	publishTrafficEvent("acct", event("e200", "kept"), trafficAccountGeneration());
	assert.equal(
		publishedTrafficSnapshot().some((row) => row.event.id === "e200"),
		true,
	);
	watchTrafficAccount("other");
	assert.equal(publishedTrafficSnapshot().length, 0);
});
