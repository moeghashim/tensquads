import assert from "node:assert/strict";
import test from "node:test";

import { AccountBus } from "../src/cloudflare-bus/account-bus.ts";
import { Storage } from "./bus-storage.ts";

test("a storage write that crosses the deadline persists no event, state, or cursor", async () => {
	const storage = new Storage();
	await storage.put("account", "review");
	await storage.put("seq", 0);
	const oldNow = Date.now;
	let now = 1000;
	Date.now = () => now;
	const put = storage.put.bind(storage);
	storage.put = async (key, value) => {
		if (key === "event:1") now = 31001;
		await put(key, value);
	};
	const syncPut = storage.kv.put.bind(storage.kv);
	storage.kv.put = (key, value) => {
		if (key === "event:1") now = 31001;
		syncPut(key, value);
	};
	const bus = new AccountBus({ storage, acceptWebSocket() {}, getWebSockets: () => [] }, {});
	try {
		const response = await bus.fetch(
			new Request("https://bus/advance", {
				method: "POST",
				body: JSON.stringify({
					accountId: "review",
					deadlineAt: 31000,
					script: [
						{
							from: "master",
							to: "orders",
							kind: "Task",
							skill: "test",
							text: "deadline probe",
							payload: {},
							writes: ["x"],
							set: { x: 1 },
						},
					],
				}),
			}),
		);
		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), { accepted: false, expired: true });
		assert.equal(storage.rows.has("event:1"), false);
		assert.equal(storage.rows.has("state:x"), false);
		assert.equal(storage.rows.has("traffic-cursor"), false);
		assert.equal(await storage.get("state:x"), undefined);
		assert.equal(await storage.get("traffic-cursor"), undefined);
	} finally {
		Date.now = oldNow;
	}
});
