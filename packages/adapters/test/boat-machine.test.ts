import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { MachineFault } from "@tensquads/kernel";
import { imageFromTemplate, uptimeText } from "../src/boat-fields.ts";
import { createBoatMachine } from "../src/boat-machine.ts";
import { type FakeBoat, startFakeBoat } from "./boat-fake.ts";

const scope = { accountId: "acct-1", mode: "account" } as const;
const wait = { intervalMs: 0, timeoutMs: 5_000 };
const tag = "registry.agents.co/market-researcher:0.1.0";

function machine(fake: FakeBoat) {
	return createBoatMachine({
		token: fake.machineToken,
		adminToken: fake.adminToken,
		basePath: fake.basePath,
		profileName: "tensquads-agents",
		secretBaseUrl: "https://example.com/hooks",
		fetchApi: fetch,
		wait,
	});
}

test("uptime text uses one day, many days, and just started", () => {
	const now = new Date("2026-11-04T00:00:00.000Z");
	assert.equal(uptimeText(now, null, new Date("2026-11-03T00:00:00.000Z")), "1 day");
	assert.equal(uptimeText(now, null, new Date("2026-11-01T00:00:00.000Z")), "3 days");
	assert.equal(
		uptimeText(now, new Date("2026-11-04T00:00:00.000Z"), new Date("2026-10-01T00:00:00.000Z")),
		"Just started",
	);
	assert.equal(imageFromTemplate("tensquads-market-researcher-0.1.0").imageId, "market-researcher");
	assert.equal(imageFromTemplate("tensquads-market-researcher-0.1.0").version, "0.1.0");
	for (const id of ["market-researcher-0.1.0", "other-market-researcher-0.1.0", "tensquads-", "tensquads-image-"]) {
		assert.throws(() => imageFromTemplate(id), { message: "The template id is not valid." });
	}
});

test("a closed profile and a missing registration never call the machine service", async () => {
	const fake = await startFakeBoat();
	try {
		for (const profileName of ["default", "moe@10claws.com"]) {
			assert.throws(
				() =>
					createBoatMachine({
						token: fake.machineToken,
						basePath: fake.basePath,
						profileName,
						fetchApi: fetch,
					}),
				(error: unknown) => error instanceof MachineFault && error.message === "The default profile is closed.",
			);
		}
		const adapter = createBoatMachine({
			token: fake.machineToken,
			basePath: fake.basePath,
			profileName: "tensquads-agents",
			fetchApi: fetch,
			wait,
		});
		await assert.rejects(
			() => adapter.registerSecret(scope, "shop"),
			(error: unknown) => {
				return error instanceof MachineFault && error.message === "The secret registration is not configured.";
			},
		);
		assert.equal(fake.creates, 0);
		assert.equal(fake.secretCalls.length, 0);
	} finally {
		await fake.close();
	}
});

test("start is idempotent and maps the dashboard fields", async () => {
	const fake = await startFakeBoat();
	try {
		const adapter = machine(fake);
		await adapter.start(scope, "orders", tag);
		await adapter.start(scope, "orders", tag);
		assert.equal(fake.creates, 1);
		const row = fake.machines()[0];
		assert.ok(row);
		assert.equal(row.env.ACCOUNT_ID, "acct-1");
		assert.equal(row.env.TENSQUADS_AGENT_ID, "orders");
		assert.equal(row.env.AGENT_ID, undefined);
		assert.equal(row.env.IMAGE_TAG, tag);
		assert.equal(row.environment, "tensquads-agents");
		assert.equal(row.labels.account, "acct-1");
		assert.equal(row.labels.agent, "orders");
		assert.equal(row.name, "vps-orders-01");
		assert.equal(await adapter.host(scope, "orders"), "vps-orders-01");
		assert.equal(await adapter.region(scope, "orders"), "EU");
		assert.equal(await adapter.size(scope, "orders"), "2 vCPU · 4 GB");
		assert.equal(await adapter.cpu(scope, "orders"), "20%");
		assert.equal(await adapter.uptime(scope, "orders"), "3 days");
		assert.equal(Object.hasOwn(adapter, "autonomy"), false);
	} finally {
		await fake.close();
	}
});

test("a run id is a label on the machine and on the template source", async () => {
	const fake = await startFakeBoat();
	try {
		const adapter = createBoatMachine({
			token: fake.machineToken,
			adminToken: fake.adminToken,
			basePath: fake.basePath,
			profileName: "tensquads-agents",
			secretBaseUrl: "https://example.com",
			fetchApi: fetch,
			wait,
			runId: "41877304107",
		});
		await adapter.start(scope, "orders", tag);
		assert.equal(fake.machines()[0]?.labels.run, "41877304107");
		await adapter.makeTemplate(scope, "img41877304107", "1");
		const source = fake.machines().find((row) => row.name.startsWith("tpl-"));
		assert.equal(source?.labels.run, "41877304107");
	} finally {
		await fake.close();
	}
});

test("a refused environment is sent again without that field", async () => {
	const fake = await startFakeBoat();
	try {
		fake.refuseEnvironment = true;
		await machine(fake).start(scope, "orders", tag);
		assert.equal(fake.creates, 1);
		assert.equal(fake.machines()[0]?.environment, null);
	} finally {
		await fake.close();
	}
});

test("stop shows paused with no process read, and resume keeps the disk", async () => {
	const fake = await startFakeBoat();
	try {
		const adapter = machine(fake);
		await adapter.start(scope, "orders", tag);
		const before = fake.processCalls;
		await adapter.stop(scope, "orders");
		assert.equal(await adapter.cpu(scope, "orders"), "0%");
		assert.equal(await adapter.uptime(scope, "orders"), "Paused");
		assert.equal(fake.processCalls, before);
		const stopped = fake.machines()[0];
		assert.equal(stopped?.state, "archived");
		assert.equal(stopped?.disk, true);
		assert.equal(stopped?.ip, null);
		assert.equal(stopped?.processCount, 0);
		await adapter.start(scope, "orders", tag);
		assert.equal(fake.creates, 1);
		await adapter.resume(scope, "orders");
		const resumed = fake.machines()[0];
		assert.equal(resumed?.state, "running");
		assert.equal(resumed?.disk, true);
		assert.equal(resumed?.ip, null);
		assert.equal(resumed?.processCount, 0);
		assert.equal(await adapter.uptime(scope, "orders"), "3 days");
	} finally {
		await fake.close();
	}
});

test("remove waits until the delete operation completes", async () => {
	const fake = await startFakeBoat();
	try {
		const adapter = machine(fake);
		await adapter.start(scope, "orders", tag);
		await adapter.remove(scope, "orders");
		assert.equal(fake.machines()[0]?.deleted, true);
		await assert.rejects(
			() => adapter.host(scope, "orders"),
			(error: unknown) => {
				return error instanceof MachineFault && error.message === "No machine for this agent.";
			},
		);
	} finally {
		await fake.close();
	}
});

test("a template save removes the source and a repeat does not start another", async () => {
	const fake = await startFakeBoat();
	try {
		const adapter = machine(fake);
		const first = await adapter.makeTemplate(scope, "market-researcher", "0.1.0");
		assert.equal(first.id, "tensquads-market-researcher-0.1.0");
		assert.equal(fake.creates, 1);
		assert.equal(fake.machines()[0]?.deleted, true);
		assert.equal(fake.machines()[0]?.file, "market-researcher\n0.1.0\n");
		assert.equal(fake.machines()[0]?.env.TENSQUADS_AGENT_ID, undefined);
		assert.equal(fake.machines()[0]?.env.AGENT_ID, undefined);
		const second = await adapter.makeTemplate(scope, "market-researcher", "0.1.0");
		assert.equal(second.id, first.id);
		assert.equal(fake.creates, 1);
		const started = await adapter.startFromTemplate(scope, first.id, "orders");
		assert.deepEqual(started, { templateId: first.id, agentId: "orders" });
		const startedRow = fake.machines().find((row) => row.name === "vps-orders-01");
		assert.equal(startedRow?.from, first.id);
		assert.equal(startedRow?.env.TENSQUADS_AGENT_ID, "orders");
		assert.equal(startedRow?.env.AGENT_ID, undefined);
		await adapter.removeTemplate(scope, first.id);
		assert.equal(fake.template(first.id), undefined);
	} finally {
		await fake.close();
	}
});

test("start from a template resumes a stopped machine", async () => {
	const fake = await startFakeBoat();
	try {
		const adapter = machine(fake);
		const template = await adapter.makeTemplate(scope, "market-researcher", "0.1.0");
		await adapter.startFromTemplate(scope, template.id, "orders");
		await adapter.stop(scope, "orders");
		const creates = fake.creates;
		const again = await adapter.startFromTemplate(scope, template.id, "orders");
		assert.deepEqual(again, { templateId: template.id, agentId: "orders" });
		assert.equal(fake.creates, creates);
		const row = fake.machines().find((item) => item.name === "vps-orders-01");
		assert.equal(row?.state, "running");
		assert.equal(await adapter.uptime(scope, "orders"), "3 days");
	} finally {
		await fake.close();
	}
});

test("a failed template save still removes the source", async () => {
	const fake = await startFakeBoat();
	try {
		fake.failSave = true;
		await assert.rejects(
			() => machine(fake).makeTemplate(scope, "market-researcher", "0.1.0"),
			(error: unknown) => {
				return (
					error instanceof MachineFault &&
					error.code === "save_failed" &&
					error.message === "The template save failed."
				);
			},
		);
		assert.equal(fake.machines()[0]?.deleted, true);
	} finally {
		await fake.close();
	}
});

test("secret registration uses the admin token and returns names only", async () => {
	const fake = await startFakeBoat();
	try {
		const adapter = machine(fake);
		await adapter.start(scope, "orders", tag);
		assert.deepEqual(await adapter.egress(scope, "orders"), []);
		const secretValue = randomBytes(16).toString("hex");
		await adapter.registerSecret(scope, "shop", secretValue);
		assert.equal(fake.secretCalls.at(-1)?.kind, "admin");
		assert.equal(fake.secretCalls.at(-1)?.valuePresent, true);
		assert.equal(fake.secretCalls.at(-1)?.value, secretValue);
		assert.deepEqual(await adapter.secrets(scope, "orders"), ["shop"]);
		assert.deepEqual(await adapter.egress(scope, "orders"), ["example.com"]);
		const fresh = machine(fake);
		assert.deepEqual(await fresh.egress(scope, "orders"), ["example.com"]);
		await adapter.removeSecret(scope, "shop");
		assert.deepEqual(await fresh.egress(scope, "orders"), []);
		assert.deepEqual(await adapter.secrets(scope, "orders"), []);
		const rendered = JSON.stringify(fake.secretCalls);
		assert.equal(rendered.includes("configured"), false);
	} finally {
		await fake.close();
	}
});

test("service errors become port errors and hide the body", async () => {
	const cases = [
		{
			status: 429,
			code: "rate_limited",
			fault: "rate_limited",
			message: "The machine service is busy. Try again later.",
		},
		{
			status: 429,
			code: "limit_reached",
			fault: "limit_reached",
			message: "The account has reached its machine limit.",
		},
		{
			status: 402,
			code: "billing",
			fault: "billing_required",
			message: "The account needs a paid plan before this machine can start.",
		},
		{ status: 503, code: "no_capacity", fault: "out_of_capacity", message: "No machine is free right now." },
	] as const;
	for (const item of cases) {
		const fake = await startFakeBoat();
		try {
			fake.nextError = { status: item.status, code: item.code, secret: "super-secret-value" };
			await assert.rejects(
				() => machine(fake).start(scope, "orders", tag),
				(error: unknown) => {
					return (
						error instanceof MachineFault &&
						error.code === item.fault &&
						error.message === item.message &&
						!error.message.includes("super-secret-value") &&
						!/boat|sandbox|snapshot|credential|proxy/i.test(error.message)
					);
				},
			);
		} finally {
			await fake.close();
		}
	}
});

test("a refused stop and expired data use their own port errors", async () => {
	const fake = await startFakeBoat();
	try {
		const adapter = machine(fake);
		await adapter.start(scope, "orders", tag);
		fake.nextError = { status: 409, code: "busy", secret: "super-secret-value" };
		await assert.rejects(
			() => adapter.stop(scope, "orders"),
			(error: unknown) => {
				return (
					error instanceof MachineFault &&
					error.code === "stop_refused" &&
					!error.message.includes("super-secret-value")
				);
			},
		);
		fake.nextError = { status: 409, code: "snapshot_data_expired", secret: "super-secret-value" };
		await assert.rejects(
			() => adapter.resume(scope, "orders"),
			(error: unknown) => {
				return (
					error instanceof MachineFault &&
					error.code === "data_expired" &&
					error.message === "The stopped machine data is no longer available."
				);
			},
		);
	} finally {
		await fake.close();
	}
});

test("the label filter accepts a comma-joined value", async () => {
	const fake = await startFakeBoat();
	try {
		await machine(fake).start(scope, "orders", tag);
		const joined = await fetch(
			`${fake.basePath}/sandboxes?label=${encodeURIComponent("agent=orders,account=acct-1")}`,
			{
				headers: { authorization: `Bearer ${fake.machineToken}` },
			},
		);
		const body = (await joined.json()) as { sandboxes: { id: string }[] };
		assert.equal(body.sandboxes.length, 1);
	} finally {
		await fake.close();
	}
});
