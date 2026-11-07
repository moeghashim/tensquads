import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { machineEnvFrom } from "./machine-env.ts";

const settings: Record<string, string> = {
	ADAPTERS: "real",
	BOAT_TOKEN: "token",
	BOAT_ADMIN_TOKEN: "admin",
	BOAT_PROFILE: "tensquads-agents",
	BOAT_BASE_PATH: "/base",
	BOAT_SECRET_BASE_URL: "https://example.com/hooks",
	RESEARCH_MODEL: "gpt-6-luna",
	RESEARCH_REASONING_EFFORT: "medium",
	WEBSITE_MODEL: "gpt-6-luna-web",
	WEBSITE_REASONING_EFFORT: "high",
};

describe("machine env for a switch", () => {
	it("passes the four model settings from the Worker env", async () => {
		const env = await machineEnvFrom(async (name) => settings[name] ?? "");
		assert.equal(env.RESEARCH_MODEL, "gpt-6-luna");
		assert.equal(env.RESEARCH_REASONING_EFFORT, "medium");
		assert.equal(env.WEBSITE_MODEL, "gpt-6-luna-web");
		assert.equal(env.WEBSITE_REASONING_EFFORT, "high");
	});

	it("passes the boat settings with the model settings", async () => {
		const env = await machineEnvFrom(async (name) => settings[name] ?? "");
		assert.deepEqual(env, settings);
	});

	it("reads each setting from the Worker env by name", async () => {
		const read: string[] = [];
		await machineEnvFrom(async (name) => {
			read.push(name);
			return "";
		});
		for (const name of Object.keys(settings)) {
			assert.ok(read.includes(name), `${name} is read`);
		}
	});
});
