import assert from "node:assert/strict";
import test from "node:test";

import { MachineFault } from "@tensquads/kernel";

import { createAccountMemoryBus } from "../src/memory-bus.ts";
import { createAccountTestMachine } from "../src/test-machine.ts";

const scope = { accountId: "acct-1", mode: "account" } as const;
const other = { accountId: "acct-2", mode: "account" } as const;

test("the account test machine starts once and pauses on stop", async () => {
	const machine = createAccountTestMachine();
	await machine.start(scope, "orders", "registry.agents.co/orders:1");
	await machine.start(scope, "orders", "registry.agents.co/orders:1");
	assert.equal(await machine.host(scope, "orders"), "vps-orders-01");
	assert.equal(await machine.region(scope, "orders"), "EU");
	assert.equal(await machine.size(scope, "orders"), "2 vCPU · 4 GB");
	assert.equal(await machine.cpu(scope, "orders"), "0%");
	assert.equal(await machine.uptime(scope, "orders"), "Just started");
	await machine.stop(scope, "orders");
	assert.equal(await machine.cpu(scope, "orders"), "0%");
	assert.equal(await machine.uptime(scope, "orders"), "Paused");
	await machine.resume(scope, "orders");
	assert.equal(await machine.uptime(scope, "orders"), "Just started");
	await machine.registerSecret(scope, "shop");
	await machine.registerSecret(scope, "shop");
	assert.deepEqual(await machine.secrets(scope, "orders"), ["shop"]);
	await machine.removeSecret(scope, "shop");
	assert.deepEqual(await machine.secrets(scope, "orders"), []);
	await machine.rotateToken(scope, "orders", "signed-token");
	assert.deepEqual(await machine.secrets(scope, "orders"), ["TENSQUADS_MACHINE_TOKEN"]);
	await assert.rejects(
		() => machine.rotateToken(scope, "orders", ""),
		(error: unknown) => error instanceof MachineFault && error.message === "The machine token is empty.",
	);
	await machine.removeSecret(scope, "TENSQUADS_MACHINE_TOKEN");
	assert.deepEqual(await machine.secrets(scope, "orders"), []);
	const template = await machine.makeTemplate(scope, "market-researcher", "0.1.0");
	assert.equal(template.id, "tensquads-market-researcher-0.1.0");
	assert.deepEqual(await machine.startFromTemplate(scope, template.id, "ads"), {
		templateId: template.id,
		agentId: "ads",
	});
	await machine.removeTemplate(scope, template.id);
	await machine.remove(scope, "orders");
	await assert.rejects(
		() => machine.host(scope, "orders"),
		(error: unknown) => {
			return error instanceof MachineFault && error.message === "No machine for this agent.";
		},
	);
});

test("two accounts do not share a bus sequence and a seen id changes nothing", async () => {
	const bus = createAccountMemoryBus({
		script: [
			{
				from: "master",
				to: "orders",
				kind: "Task",
				skill: "orders.watch",
				text: "Watch",
				payload: {},
				writes: ["orders"],
				set: { orders: "open" },
			},
		],
	});
	const first = await bus.nextEvent(scope);
	const second = await bus.nextEvent(scope);
	assert.equal(first?.id, "e100");
	assert.equal(second?.id, "e101");
	assert.deepEqual(await bus.store(scope), { orders: "open" });
	const before = (await bus.events(scope)).length;
	await bus.publish(scope, {
		id: "e100",
		from: "master",
		to: "orders",
		kind: "Task",
		skill: "orders.watch",
		text: "Again",
		payload: {},
		writes: ["orders"],
		set: { orders: "changed" },
	});
	assert.equal((await bus.events(scope)).length, before);
	assert.deepEqual(await bus.store(scope), { orders: "open" });
	const otherFirst = await bus.nextEvent(other);
	assert.equal(otherFirst?.id, "e100");
	assert.equal((await bus.events(scope)).length, before);
});

test("account simulation skips seeded and published ids and keeps advancing", async () => {
	const step = {
		from: "master",
		to: "orders",
		kind: "Task" as const,
		skill: "orders.watch",
		text: "Watch",
		payload: {},
		writes: ["orders"],
		set: { orders: "open" },
	};
	for (const seeded of [false, true]) {
		const bus = createAccountMemoryBus({
			events: seeded ? [{ ...step, id: "e100" }] : [],
			script: [step, { ...step, text: "Next" }],
		});
		if (!seeded) await bus.publish(scope, { ...step, id: "e101" });
		const first = await bus.nextEvent(scope);
		const second = await bus.nextEvent(scope);
		assert.equal(first?.id, seeded ? "e101" : "e102");
		assert.equal(second?.id, seeded ? "e102" : "e103");
		assert.equal(first?.text, "Next");
		assert.equal(second?.text, "Watch");
		assert.equal(first?.time, "11:04");
		assert.equal(second?.time, "11:05");
		assert.equal(new Set((await bus.events(scope)).map(({ id }) => id)).size, 3);
		assert.deepEqual(await bus.store(scope), { orders: "open" });
		assert.equal((await bus.nextEvent(other))?.id, seeded ? "e101" : "e100");
	}
});
