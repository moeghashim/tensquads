import assert from "node:assert/strict";
import test from "node:test";

import type { AccountMachine, AccountScope } from "@tensquads/kernel";

import { liveMachine, switchAgentMachine, switchingMachine } from "../src/agent-machine.ts";
import { HEARTBEATS, recordBeat, sweepHeartbeats } from "../src/cloudflare-bus/heartbeat.ts";
import { startFakeBoat } from "./boat-fake.ts";
import { Storage } from "./bus-storage.ts";

const scope: AccountScope = { accountId: "acct", mode: "account" } as AccountScope;

// A fake machine that records stop and resume calls into one shared log.
// Each call can be made to fail.
function fakeMachine(log: string[], failing: "stop" | "resume" | null = null) {
	const machine = {
		async stop(_scope: AccountScope, agentId: string) {
			log.push(`stop ${agentId}`);
			if (failing === "stop") throw new Error("boat refused");
		},
		async resume(_scope: AccountScope, agentId: string) {
			log.push(`resume ${agentId}`);
			if (failing === "resume") throw new Error("boat refused");
		},
	} as unknown as AccountMachine;
	return machine;
}

// A write that stores the switch in a shared log and returns the written row.
function persistTo(log: string[], on: boolean, status: "written" | "superseded" = "written", storedOn = on) {
	return async () => {
		log.push(`write ${on}`);
		return { status, row: { id: "market", on: storedOn } };
	};
}

test("switching an agent off writes the stored switch, then stops its machine", async () => {
	const log: string[] = [];
	const result = await switchAgentMachine(fakeMachine(log), scope, "market", persistTo(log, false));
	assert.deepEqual(log, ["write false", "stop market"]);
	assert.equal(result.status, "written");
	assert.equal(result.row.on, false);
});

test("switching an agent on writes the stored switch, then resumes its machine", async () => {
	const log: string[] = [];
	const result = await switchAgentMachine(fakeMachine(log), scope, "market", persistTo(log, true));
	assert.deepEqual(log, ["write true", "resume market"]);
	assert.equal(result.row.on, true);
});

test("a failed write means no machine action", async () => {
	const log: string[] = [];
	await assert.rejects(
		switchAgentMachine(fakeMachine(log), scope, "market", async () => {
			log.push("write false");
			throw new Error("database closed");
		}),
		/database closed/,
	);
	assert.deepEqual(log, ["write false"]);
});

test("a failed stop after a committed write keeps the stored switch and reaches the owner", async () => {
	const log: string[] = [];
	const stored = new Map<string, boolean>([["market", true]]);
	await assert.rejects(
		switchAgentMachine(fakeMachine(log, "stop"), scope, "market", async () => {
			stored.set("market", false);
			log.push("write false");
			return { status: "written" as const, row: { id: "market", on: false } };
		}),
		/boat refused/,
	);
	assert.deepEqual(log, ["write false", "stop market"]);
	assert.equal(stored.get("market"), false);
});

test("a failed resume after a committed write keeps the stored switch and reaches the owner", async () => {
	const log: string[] = [];
	const stored = new Map<string, boolean>([["market", false]]);
	await assert.rejects(
		switchAgentMachine(fakeMachine(log, "resume"), scope, "market", async () => {
			stored.set("market", true);
			log.push("write true");
			return { status: "written" as const, row: { id: "market", on: true } };
		}),
		/boat refused/,
	);
	assert.deepEqual(log, ["write true", "resume market"]);
	assert.equal(stored.get("market"), true);
});

test("a superseded write moves the machine to the value that was stored", async () => {
	const log: string[] = [];
	const result = await switchAgentMachine(
		fakeMachine(log),
		scope,
		"market",
		persistTo(log, false, "superseded", true),
	);
	assert.deepEqual(log, ["write false", "resume market"]);
	assert.equal(result.status, "superseded");
	assert.equal(result.row.on, true);
});

test("without a machine the switch only writes, as in test mode", async () => {
	const log: string[] = [];
	const result = await switchAgentMachine(undefined, scope, "support", persistTo(log, false));
	assert.deepEqual(log, ["write false"]);
	assert.equal(result.status, "written");
});

test("the heartbeat does not resume a machine while its switch-off is in progress", async () => {
	const storage = new Storage();
	await storage.put("account", "acct");
	await recordBeat(storage, "market", 0);
	const stored = new Map<string, boolean>([["market", true]]);
	const resumed: string[] = [];
	const sweep = () =>
		sweepHeartbeats(storage, {
			now: () => 180_000,
			agentOn: async (_accountId, agentId) => stored.get(agentId) === true,
			resumeAgent: async (_accountId, agentId) => {
				resumed.push(agentId);
			},
		});
	const machine = {
		async stop() {
			// The stored switch is already off. A heartbeat sweep runs between the write and the stop.
			await sweep();
		},
		async resume() {
			throw new Error("the switch-off must not resume the machine");
		},
	} as unknown as AccountMachine;
	await switchAgentMachine(machine, scope, "market", async () => {
		stored.set("market", false);
		return { status: "written" as const, row: { id: "market", on: false } };
	});
	assert.deepEqual(resumed, []);
	const beats = await storage.get<Record<string, { resumedAt?: number }>>(HEARTBEATS);
	assert.equal(beats?.market?.resumedAt, 180_000);
});

test("test mode and agents without a machine get no boat machine", () => {
	const env = { BOAT_TOKEN: "token", BOAT_PROFILE: "profile" };
	assert.equal(switchingMachine({ ...env, ADAPTERS: "test" }, "market"), undefined);
	assert.equal(switchingMachine({ ...env }, "market"), undefined);
	assert.equal(switchingMachine({ ...env, ADAPTERS: "real" }, "support"), undefined);
	assert.ok(switchingMachine({ ...env, ADAPTERS: "real" }, "market"));
});

const modelSettings = {
	RESEARCH_MODEL: "gpt-6-luna",
	RESEARCH_REASONING_EFFORT: "medium",
	WEBSITE_MODEL: "gpt-6-luna",
	WEBSITE_REASONING_EFFORT: "medium",
};

test("switching the market agent on passes the model settings to its machine", async () => {
	const fake = await startFakeBoat();
	try {
		const env = {
			ADAPTERS: "real",
			BOAT_TOKEN: fake.machineToken,
			BOAT_ADMIN_TOKEN: fake.adminToken,
			BOAT_PROFILE: "tensquads-agents",
			BOAT_BASE_PATH: fake.basePath,
			BOAT_SECRET_BASE_URL: "https://example.com/hooks",
			fetchApi: fetch,
			...modelSettings,
		};
		const machine = liveMachine(env);
		const tag = "registry.agents.co/market-researcher:0.1.0";
		await machine.start(scope, "market", tag);
		await machine.stop(scope, "market");
		await machine.resume(scope, "market");
		assert.equal(fake.machines()[0]?.state, "running");
	} finally {
		await fake.close();
	}
});

test("switching the market agent on fails before any boat request when the model settings are missing", async () => {
	const fake = await startFakeBoat();
	try {
		const env = {
			ADAPTERS: "real",
			BOAT_TOKEN: fake.machineToken,
			BOAT_ADMIN_TOKEN: fake.adminToken,
			BOAT_PROFILE: "tensquads-agents",
			BOAT_BASE_PATH: fake.basePath,
			BOAT_SECRET_BASE_URL: "https://example.com/hooks",
			fetchApi: fetch,
		};
		const tag = "registry.agents.co/market-researcher:0.1.0";
		await liveMachine({ ...env, ...modelSettings }).start(scope, "market", tag);
		await liveMachine({ ...env, ...modelSettings }).stop(scope, "market");
		const before = fake.machines()[0]?.state;
		await assert.rejects(liveMachine(env).resume(scope, "market"), /The research model is not configured\./);
		assert.equal(fake.machines()[0]?.state, before);
	} finally {
		await fake.close();
	}
});
