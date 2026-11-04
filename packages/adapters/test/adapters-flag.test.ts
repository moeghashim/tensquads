import assert from "node:assert/strict";
import test from "node:test";

import { MachineFault } from "@tensquads/kernel";

import { chooseAdapters } from "../src/adapter-choice.ts";
import { pickWorkerAdapters } from "../src/adapters-flag.ts";

test("the adapter flag defaults to test", () => {
	assert.equal(chooseAdapters("test"), "test");
	assert.equal(chooseAdapters(undefined), "test");
	assert.equal(chooseAdapters("realish"), "test");
	assert.equal(chooseAdapters("real"), "real");
	const missing = pickWorkerAdapters({});
	const named = pickWorkerAdapters({ ADAPTERS: "test" });
	assert.equal(missing.machine, named.machine);
	assert.equal(missing.bus, named.bus);
});

test("real adapters are built only when the flag and the config are present", () => {
	let fetched = false;
	const fetchApi: typeof fetch = () => {
		fetched = true;
		return Promise.reject(new Error("fetched"));
	};
	assert.throws(
		() => pickWorkerAdapters({ ADAPTERS: "real", fetchApi }),
		(error: unknown) => error instanceof MachineFault && error.message === "The machine service is not configured.",
	);
	assert.throws(
		() =>
			pickWorkerAdapters({
				ADAPTERS: "real",
				BOAT_TOKEN: "machine-token-fixture",
				BOAT_PROFILE: "tensquads-agents",
				fetchApi,
			}),
		(error: unknown) => error instanceof MachineFault && error.message === "The bus is not configured.",
	);
	const namespace = {
		idFromName: () => "id",
		get: () => ({
			fetch: () => Promise.reject(new Error("fetched")),
		}),
	};
	const real = {
		ADAPTERS: "real",
		BOAT_TOKEN: "machine-token-fixture",
		BOAT_ADMIN_TOKEN: "admin-token-fixture",
		BOAT_PROFILE: "tensquads-agents",
		DATABASE_URL: "postgres://example.test/db",
		ACCOUNT_BUS: namespace,
		fetchApi,
	} as const;
	assert.throws(
		() => pickWorkerAdapters(real),
		(error: unknown) => error instanceof MachineFault && error.message === "The bus is not configured.",
	);
	const adapters = pickWorkerAdapters({
		...real,
		BUS_QUEUE: { async send() {} },
	});
	assert.equal(typeof adapters.machine.start, "function");
	assert.equal(fetched, false);
});
