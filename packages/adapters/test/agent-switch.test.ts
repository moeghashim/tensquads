import assert from "node:assert/strict";
import test from "node:test";

import type { AccountMachine, AccountScope } from "@tensquads/kernel";

import { switchAgentMachine, switchingMachine } from "../src/agent-machine.ts";

const scope: AccountScope = { accountId: "acct", mode: "account" } as AccountScope;

// A fake machine that only records stop and resume calls. Each call can be made to fail.
function fakeMachine(failing: "stop" | "resume" | null = null) {
	const calls: string[] = [];
	const machine = {
		async stop(_scope: AccountScope, agentId: string) {
			calls.push(`stop ${agentId}`);
			if (failing === "stop") throw new Error("boat refused");
		},
		async resume(_scope: AccountScope, agentId: string) {
			calls.push(`resume ${agentId}`);
			if (failing === "resume") throw new Error("boat refused");
		},
	} as unknown as AccountMachine;
	return { machine, calls };
}

function written(on: boolean) {
	return async () => ({ status: "written" as const, row: { id: "market", on } });
}

test("switching an agent off stops its machine, then stores the switch", async () => {
	const { machine, calls } = fakeMachine();
	const order: string[] = [];
	const result = await switchAgentMachine(machine, scope, "market", false, async () => {
		order.push("persist");
		return { status: "written", row: { id: "market", on: false } };
	});
	assert.deepEqual(calls, ["stop market"]);
	assert.deepEqual(order, ["persist"]);
	assert.equal(result.status, "written");
	assert.equal(result.row.on, false);
});

test("switching an agent on resumes its machine", async () => {
	const { machine, calls } = fakeMachine();
	const result = await switchAgentMachine(machine, scope, "market", true, written(true));
	assert.deepEqual(calls, ["resume market"]);
	assert.equal(result.row.on, true);
});

test("a failed stop leaves the stored switch alone", async () => {
	const { machine, calls } = fakeMachine("stop");
	let persisted = false;
	await assert.rejects(
		switchAgentMachine(machine, scope, "market", false, async () => {
			persisted = true;
			return { status: "written", row: { id: "market", on: false } };
		}),
		/boat refused/,
	);
	assert.deepEqual(calls, ["stop market"]);
	assert.equal(persisted, false);
});

test("a failed write moves the machine back to its stored state", async () => {
	const { machine, calls } = fakeMachine();
	await assert.rejects(
		switchAgentMachine(machine, scope, "market", false, async () => {
			throw new Error("database closed");
		}),
		/database closed/,
	);
	assert.deepEqual(calls, ["stop market", "resume market"]);
});

test("a superseded write moves the machine to the value that was stored", async () => {
	const { machine, calls } = fakeMachine();
	const result = await switchAgentMachine(machine, scope, "market", false, async () => ({
		status: "superseded" as const,
		row: { id: "market", on: true },
	}));
	assert.deepEqual(calls, ["stop market", "resume market"]);
	assert.equal(result.status, "superseded");
});

test("without a machine the switch only writes, as in test mode", async () => {
	let persisted = 0;
	const result = await switchAgentMachine(undefined, scope, "support", false, async () => {
		persisted += 1;
		return { status: "written" as const, row: { id: "support", on: false } };
	});
	assert.equal(persisted, 1);
	assert.equal(result.status, "written");
});

test("test mode and agents without a machine get no boat machine", () => {
	const env = { BOAT_TOKEN: "token", BOAT_PROFILE: "profile" };
	assert.equal(switchingMachine({ ...env, ADAPTERS: "test" }, "market"), undefined);
	assert.equal(switchingMachine({ ...env }, "market"), undefined);
	assert.equal(switchingMachine({ ...env, ADAPTERS: "real" }, "support"), undefined);
	assert.ok(switchingMachine({ ...env, ADAPTERS: "real" }, "market"));
});
