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
