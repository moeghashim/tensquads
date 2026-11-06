import assert from "node:assert/strict";
import test from "node:test";

import worker from "./worker.ts";

test("the cron entry pokes each account with an old pending delivery", async () => {
	const poked: string[] = [];
	const env = {
		ADAPTERS: "real",
		staleDeliveryAccounts: async () => ["acct-cron"],
		ACCOUNT_BUS: {
			idFromName: (name: string) => name,
			get: () => ({
				fetch: async (input: Request | string | URL) => {
					poked.push(String(input));
					return new Response("{}");
				},
			}),
		},
	};
	await worker.scheduled({}, env as never);
	assert.deepEqual(poked, ["https://bus/deliveries/retry"]);
});
