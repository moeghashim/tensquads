import assert from "node:assert/strict";
import test from "node:test";

import { assertDeletable, cleanupTrial, isTrialQueue, isTrialWorker } from "../bus-trial-cleanup.mjs";

const account = "678c5a795f40f7e9f33b8a71248cc829";
const now = Date.parse("2026-11-05T12:00:00.000Z");
const recent = "2026-11-05T11:30:00.000Z";
const old = "2026-11-05T08:00:00.000Z";
const plan = {
	runId: "41877304107",
	workerName: "tensquads-trial-41877304107",
	queue: "tensquads-bus-41877304107",
	deadLetter: "tensquads-bus-dlq-41877304107",
	cloudflareAccountId: account,
};

function consumerAttached(consumer, name) {
	return consumer.script === name || consumer.script_name === name;
}

function apiFor(state) {
	const calls = [];
	async function api(request) {
		calls.push(`${request.method} ${request.path}`);
		if (request.method === "GET" && request.path.startsWith(`${accountPath()}/workers/scripts`)) {
			return { status: 200, success: true, result: state.scripts, result_info: { total_pages: 1 } };
		}
		if (request.method === "GET" && request.path.startsWith(`${accountPath()}/queues?`)) {
			return { status: 200, success: true, result: state.queues, result_info: { total_pages: 1 } };
		}
		if (request.method === "GET" && request.path.includes("/consumers")) {
			const queueId = request.path.split("/")[4];
			return { status: 200, success: true, result: state.consumers[queueId] ?? [] };
		}
		if (request.method === "DELETE" && request.path.includes("/consumers/")) {
			const [, queueId, consumerId] = request.path.match(/queues\/([^/]+)\/consumers\/([^/?]+)/) ?? [];
			const list = state.consumers[queueId] ?? [];
			state.consumers[queueId] = list.filter((consumer) => consumer.consumer_id !== consumerId);
			return { status: 200, success: true, result: null, errors: [] };
		}
		if (request.method === "DELETE" && request.path.includes("/workers/scripts/")) {
			const name = decodeURIComponent(request.path.split("/").at(-1).split("?")[0]);
			const attached = Object.values(state.consumers)
				.flat()
				.some((consumer) => consumerAttached(consumer, name));
			if (attached) return { status: 400, success: false, errors: [{ code: 10064, message: "consumer" }] };
			state.scripts = state.scripts.filter((script) => script.id !== name);
			if (!request.path.includes("force=true"))
				return { status: 400, success: false, errors: [{ code: 10064, message: "force" }] };
			return { status: 200, success: true, result: null, errors: [] };
		}
		if (request.method === "DELETE" && request.path.includes("/queues/")) {
			const queueId = request.path.split("/")[4];
			const consumersLeft = state.consumers[queueId]?.length ?? 0;
			if (consumersLeft > 0) return { status: 400, success: false, errors: [{ code: 11005, message: "bound" }] };
			state.queues = state.queues.filter((item) => item.queue_id !== queueId);
			return { status: 200, success: true, result: null, errors: [] };
		}
		return { status: 404, success: false, errors: [{ code: 10007, message: "not found" }] };
	}
	return { api, calls };
}

function accountPath() {
	return `/accounts/${account}`;
}

function state() {
	return {
		scripts: [
			{ id: "tensquads", created_on: old },
			{ id: "tensquads-trial-41877304107", created_on: recent },
			{ id: "tensquads-trial-11111111111", created_on: old },
			{ id: "tensquads-trial-22222222222", created_on: recent },
		],
		queues: [
			{ queue_id: "q-prod", queue_name: "tensquads-bus", created_on: old },
			{ queue_id: "q-prod-dlq", queue_name: "tensquads-bus-dlq", created_on: old },
			{ queue_id: "q-run", queue_name: "tensquads-bus-41877304107", created_on: recent },
			{ queue_id: "q-run-dlq", queue_name: "tensquads-bus-dlq-41877304107", created_on: recent },
			{ queue_id: "q-old", queue_name: "tensquads-bus-11111111111", created_on: old },
			{ queue_id: "q-old-dlq", queue_name: "tensquads-bus-dlq-11111111111", created_on: old },
			{ queue_id: "q-young", queue_name: "tensquads-bus-22222222222", created_on: recent },
		],
		consumers: {
			"q-prod": [{ consumer_id: "c-prod", script_name: "tensquads", type: "worker" }],
			"q-run": [{ consumer_id: "c1", script_name: "tensquads-trial-41877304107", type: "worker" }],
			"q-run-dlq": [{ consumer_id: "c2", script_name: "tensquads-trial-41877304107", type: "worker" }],
			"q-old": [{ consumer_id: "c3", script_name: "tensquads-trial-11111111111", type: "worker" }],
			"q-young": [{ consumer_id: "c4", script_name: "tensquads-trial-22222222222", type: "worker" }],
		},
	};
}

test("production names are never trial resources", () => {
	assert.equal(isTrialWorker("tensquads"), false);
	assert.equal(isTrialQueue("tensquads-bus"), false);
	assert.equal(isTrialQueue("tensquads-bus-dlq"), false);
	assert.throws(() => assertDeletable("tensquads", "worker"), /production/);
	assert.throws(() => assertDeletable("tensquads-bus", "queue"), /production/);
	assert.throws(() => assertDeletable("tensquads-bus-dlq", "queue"), /production/);
});

test("cleanup deletes consumers, then the worker, then both queues, and sweeps resources older than two hours", async () => {
	const current = state();
	const { api, calls } = apiFor(current);
	const left = await cleanupTrial(plan, api, now);
	assert.deepEqual(left, []);
	const runConsumer = calls.findIndex((call) => call.includes("/consumers/c1"));
	const runWorker = calls.findIndex((call) => call.includes("/workers/scripts/tensquads-trial-41877304107"));
	const runQueue = calls.findIndex((call) => call.endsWith("/queues/q-run"));
	const runDlq = calls.findIndex((call) => call.endsWith("/queues/q-run-dlq"));
	assert.ok(runConsumer < runWorker);
	assert.ok(runWorker < runQueue);
	assert.ok(runQueue < runDlq);
	assert.equal(
		calls.some((call) => call.includes("tensquads-trial-11111111111")),
		true,
	);
	assert.equal(
		calls.some((call) => call.includes("/workers/scripts/tensquads?") || call.endsWith("/workers/scripts/tensquads")),
		false,
	);
	assert.equal(
		calls.some((call) => call.includes("/queues/q-prod")),
		false,
	);
	assert.equal(
		calls.some((call) => call.includes("22222222222")),
		false,
	);
	assert.deepEqual(
		current.scripts.map((script) => script.id),
		["tensquads", "tensquads-trial-22222222222"],
	);
	assert.deepEqual(
		current.queues.map((queue) => queue.queue_name),
		["tensquads-bus", "tensquads-bus-dlq", "tensquads-bus-22222222222"],
	);
	assert.deepEqual(
		current.consumers["q-prod"].map((consumer) => consumer.script_name),
		["tensquads"],
	);
});

test("cleanup matches a consumer on script and on script_name", async () => {
	const current = state();
	current.scripts = current.scripts.filter((script) => script.id === "tensquads" || script.id.endsWith("41877304107"));
	current.queues = current.queues.filter(
		(queue) => queue.queue_name === "tensquads-bus" || queue.queue_name.endsWith("41877304107"),
	);
	current.consumers = {
		"q-prod": [
			{
				consumer_id: "c-prod",
				created_on: old,
				queue_id: "q-prod",
				queue_name: "tensquads-bus",
				script: "tensquads",
				settings: {},
				type: "worker",
			},
		],
		"q-run": [
			{
				consumer_id: "c-script",
				created_on: recent,
				dead_letter_queue: "tensquads-bus-dlq-41877304107",
				queue_id: "q-run",
				queue_name: "tensquads-bus-41877304107",
				script: "tensquads-trial-41877304107",
				settings: { batch_size: 10 },
				type: "worker",
			},
		],
		"q-run-dlq": [
			{
				consumer_id: "c-name",
				created_on: recent,
				queue_id: "q-run-dlq",
				queue_name: "tensquads-bus-dlq-41877304107",
				script_name: "tensquads-trial-41877304107",
				settings: {},
				type: "worker",
			},
		],
	};
	const { api, calls } = apiFor(current);
	const left = await cleanupTrial(plan, api, now);
	const consumerDelete = calls.findIndex((call) => call.includes("/consumers/c-script"));
	const nameDelete = calls.findIndex((call) => call.includes("/consumers/c-name"));
	const workerDelete = calls.findIndex((call) => call.includes("/workers/scripts/tensquads-trial-41877304107"));
	const queueDelete = calls.findIndex((call) => call.endsWith("/queues/q-run"));
	assert.deepEqual(left, []);
	assert.ok(consumerDelete >= 0 && consumerDelete < workerDelete);
	assert.ok(nameDelete >= 0 && nameDelete < workerDelete);
	assert.ok(workerDelete < queueDelete);
	assert.equal(
		current.scripts.some((script) => script.id === "tensquads-trial-41877304107"),
		false,
	);
	assert.deepEqual(
		current.queues.map((queue) => queue.queue_name),
		["tensquads-bus"],
	);
	assert.deepEqual(
		current.consumers["q-prod"].map((consumer) => consumer.script),
		["tensquads"],
	);
	assert.deepEqual(current.consumers["q-run"], []);
	assert.deepEqual(current.consumers["q-run-dlq"], []);
});

test("a missing trial worker is already gone", async () => {
	const current = state();
	current.scripts = current.scripts.filter((script) => script.id === "tensquads");
	current.queues = current.queues.filter(
		(queue) => queue.queue_name === "tensquads-bus" || queue.queue_name === "tensquads-bus-dlq",
	);
	current.consumers = { "q-prod": current.consumers["q-prod"] };
	const { api } = apiFor(current);
	const left = await cleanupTrial(plan, api, now);
	assert.deepEqual(left, []);
	assert.deepEqual(
		current.queues.map((queue) => queue.queue_name),
		["tensquads-bus", "tensquads-bus-dlq"],
	);
});
