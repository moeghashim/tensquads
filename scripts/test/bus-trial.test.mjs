import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	busTrialPlan,
	childEnv,
	createTrialAccount,
	deleteRows,
	executeBusTrial,
	redact,
	trialConfig,
	trialWorkerUrl,
} from "../bus-trial.mjs";

const root = new URL("../../", import.meta.url);
const source = readFileSync(new URL("apps/web/wrangler.jsonc", root), "utf8");
const env = {
	BUS_TRIAL: "1",
	GITHUB_RUN_ID: "41877304107",
	CLOUDFLARE_API_TOKEN: "cf-token-value",
	CLOUDFLARE_ACCOUNT_ID: "678c5a795f40f7e9f33b8a71248cc829",
	TEST_DATABASE_URL: "postgres://example.test/trial",
	BOAT_API_KEY: "boat-api-key-value",
	NEON_POSTGRES_CONNECTION_STRING: "postgres://example.test/live",
};

test("the bus trial stays off unless its input is set", () => {
	assert.equal(busTrialPlan({}).message, "The bus trial is off.");
	assert.equal(busTrialPlan({ ...env, BUS_TRIAL: "0" }).message, "The bus trial is off.");
	assert.equal(busTrialPlan({ ...env, CLOUDFLARE_API_TOKEN: " " }).message, "CLOUDFLARE_API_TOKEN is absent.");
	assert.equal(busTrialPlan({ ...env, CLOUDFLARE_ACCOUNT_ID: " " }).message, "CLOUDFLARE_ACCOUNT_ID is absent.");
	assert.equal(
		busTrialPlan({ ...env, TEST_DATABASE_URL: env.NEON_POSTGRES_CONNECTION_STRING }).message,
		"The bus trial must not use the live database.",
	);
	const plan = busTrialPlan(env);
	assert.equal(plan.ok, true);
	assert.equal(plan.workerName, "tensquads-trial-41877304107");
	assert.equal(plan.queue, "tensquads-bus-41877304107");
	assert.equal(plan.deadLetter, "tensquads-bus-dlq-41877304107");
	assert.equal(plan.cleanup, false);
});

test("the trial worker config keeps the project account and replaces the queue names", () => {
	const plan = busTrialPlan(env);
	const config = trialConfig(source, plan);
	assert.equal(config.account_id, "678c5a795f40f7e9f33b8a71248cc829");
	assert.equal(config.name, plan.workerName);
	assert.equal(config.vars.ADAPTERS, "real");
	const built = trialConfig(
		JSON.stringify({
			name: "tensquads",
			account_id: "678c5a795f40f7e9f33b8a71248cc829",
			main: "index.js",
			no_bundle: true,
			assets: { directory: "../client" },
			vars: { ADAPTERS: "test" },
		}),
		plan,
	);
	assert.equal(built.main, "index.js");
	assert.equal(built.no_bundle, true);
	assert.equal(built.assets.directory, "../client");
	assert.deepEqual(built.assets.run_worker_first, ["/machine/*"]);
	assert.equal(built.workers_dev, true);
	assert.equal(built.vars.ADAPTERS, "real");
	assert.equal(config.workers_dev, true);
	assert.equal(
		trialWorkerUrl(
			"https://welcome.developers.workers.dev\nhttps://tensquads-trial-418773041079.example.workers.dev\nhttps://tensquads-trial-41877304107.example.workers.dev\n",
			plan.workerName,
		),
		"https://tensquads-trial-41877304107.example.workers.dev",
	);
	assert.equal(config.queues.producers[0].queue, plan.queue);
	assert.equal(config.queues.consumers[0].dead_letter_queue, plan.deadLetter);
	assert.equal(JSON.stringify(config).includes('tensquads-bus"'), false);
});

test("wrangler output and the child environment do not carry the trial secrets", async () => {
	const plan = busTrialPlan(env);
	const child = childEnv(
		{
			PATH: "/usr/bin",
			NEON_POSTGRES_CONNECTION_STRING: env.NEON_POSTGRES_CONNECTION_STRING,
			CLOUDFLARE_API_KEY: "personal-key",
			CLOUDFLARE_WORKERS_API_TOKEN: "other-token",
			BOAT_API_KEY: env.BOAT_API_KEY,
			TEST_DATABASE_URL: env.TEST_DATABASE_URL,
		},
		plan,
	);
	assert.equal(child.CLOUDFLARE_API_TOKEN, plan.cloudflareToken);
	assert.equal(child.CLOUDFLARE_ACCOUNT_ID, plan.cloudflareAccountId);
	assert.equal(child.CLOUDFLARE_WORKERS_API_TOKEN, undefined);
	assert.equal(child.NEON_POSTGRES_CONNECTION_STRING, undefined);
	assert.equal(child.BOAT_API_KEY, undefined);
	assert.equal(child.TEST_DATABASE_URL, undefined);
	assert.equal(child.CLOUDFLARE_API_KEY, undefined);
	assert.equal(redact(`failed ${plan.databaseUrl}`, [plan.databaseUrl]), "failed [redacted]");
	const calls = [];
	const directory = mkdtempSync(join(tmpdir(), "tensquads-bus-trial-test-"));
	let code = 1;
	let accountCreated = false;
	try {
		code = await executeBusTrial(plan, {
			source,
			log(text) {
				calls.push(text);
			},
			tempDir: () => directory,
			async run(args) {
				calls.push(args.join(" "));
				assert.equal(args.includes("tensquads"), false);
				if (args[0] === "deploy") {
					return {
						stdout:
							"https://welcome.developers.workers.dev\nPublished https://tensquads-trial-41877304107.example.workers.dev\n",
					};
				}
				return { stdout: "" };
			},
			async createAccount(databaseUrl, account) {
				assert.equal(databaseUrl, plan.databaseUrl);
				assert.equal(account, plan.accountId);
				accountCreated = true;
			},
			async fetch(url) {
				assert.equal(accountCreated, true);
				calls.push(url);
				return { ok: true, status: 200 };
			},
			async waitForEvent() {
				return true;
			},
			async cleanup(current) {
				assert.equal(current.workerName.startsWith("tensquads-trial-"), true);
				return [];
			},
		});
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
	assert.equal(code, 0);
	assert.equal(calls.join("\n").includes(plan.boatToken), false);
	assert.equal(calls.join("\n").includes(plan.databaseUrl), false);
	assert.equal(calls.join("\n").includes(plan.cloudflareToken), false);
	assert.equal(calls.includes("https://tensquads-trial-41877304107.example.workers.dev/machine/send"), true);
	assert.equal(
		calls.some((line) => String(line).includes("welcome.developers")),
		false,
	);
	const proof = calls.findIndex((line) => String(line).startsWith("bus-trial run="));
	const cleanup = calls.findIndex((line) => String(line).startsWith("bus-cleanup-check"));
	assert.match(calls[proof], /^bus-trial run=41877304107 event=trial-41877304107 status=200 database=reached$/);
	assert.match(calls[cleanup], /^bus-cleanup-check run=41877304107 left=none$/);
	assert.ok(proof < cleanup);
});

async function runTrial(plan, sourceText, overrides) {
	const calls = [];
	const directory = mkdtempSync(join(tmpdir(), "tensquads-bus-trial-test-"));
	try {
		const code = await executeBusTrial(plan, {
			source: sourceText,
			log(text) {
				calls.push(text);
			},
			tempDir: () => directory,
			async run() {
				return {
					stdout: "Published https://tensquads-trial-41877304107.example.workers.dev\n",
				};
			},
			async createAccount() {},
			async fetch() {
				return overrides.response;
			},
			async waitForEvent() {
				return overrides.reached;
			},
			async cleanup() {
				if (overrides.cleanupError) throw new Error(overrides.cleanupError);
				return overrides.left ?? [];
			},
		});
		return { code, calls };
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

test("a cleanup failure still reports the send status, event id, and database row", async () => {
	const plan = busTrialPlan(env);
	const { code, calls } = await runTrial(plan, source, {
		response: { ok: true, status: 200 },
		reached: true,
		left: ["tensquads-trial-41877304107", "code:10064", "code:11005"],
	});
	const proof = calls.findIndex((line) => String(line).startsWith("bus-trial run="));
	const cleanup = calls.findIndex((line) => String(line).startsWith("bus-cleanup-check"));
	assert.equal(code, 1);
	assert.match(calls[proof], /^bus-trial run=41877304107 event=trial-41877304107 status=200 database=reached$/);
	assert.match(
		calls[cleanup],
		/^bus-cleanup-check run=41877304107 left=tensquads-trial-41877304107,code:10064,code:11005$/,
	);
	assert.ok(proof < cleanup);
});

test("a failed send is reported before cleanup runs", async () => {
	const plan = busTrialPlan(env);
	const { code, calls } = await runTrial(plan, source, {
		response: {
			ok: false,
			status: 404,
			async text() {
				return "missing";
			},
		},
		reached: false,
		cleanupError: "cleanup exploded",
	});
	const proof = calls.findIndex((line) => String(line).startsWith("bus-trial run="));
	const failure = calls.findIndex((line) => String(line).startsWith("The trial send failed"));
	const cleanup = calls.findIndex((line) => String(line).startsWith("bus-cleanup-check"));
	assert.equal(code, 1);
	assert.match(calls[proof], /^bus-trial run=41877304107 event=trial-41877304107 status=404 database=absent$/);
	assert.ok(failure > proof);
	assert.match(calls[cleanup], /^bus-cleanup-check run=41877304107 left=cleanup exploded$/);
	assert.ok(cleanup > failure);
});

function sqlRecorder(results = []) {
	const calls = [];
	return {
		calls,
		async sql(strings, ...values) {
			calls.push({ text: strings.join("?").replace(/\s+/g, " ").trim(), values });
			return results[calls.length - 1] ?? [];
		},
	};
}

test("trial account creation emits a scoped parameterized Neon insert", async () => {
	const { sql, calls } = sqlRecorder();
	const { accountId } = busTrialPlan(env);
	await createTrialAccount(sql, accountId);
	assert.deepEqual(calls, [
		{
			text: "insert into accounts (id, account_id, name, owner, email, tint, agents, online, tasks, last_active, created_week, mission, sort_order) values (?, ?, '', '', '', '', 0, 0, 0, '', 0, '', 0) on conflict do nothing",
			values: [accountId, accountId],
		},
	]);
});

test("trial row cleanup emits child deletes before the scoped parent delete", async () => {
	const { sql, calls } = sqlRecorder();
	const { accountId } = busTrialPlan(env);
	assert.equal(await deleteRows(sql, accountId), 0);
	assert.deepEqual(calls, [
		{ text: "delete from bus_events where account_id = ?", values: [accountId] },
		{ text: "delete from state_entries where account_id = ?", values: [accountId] },
		{ text: "delete from accounts where id = ?", values: [accountId] },
		{ text: "select id from bus_events where account_id = ?", values: [accountId] },
		{ text: "select key from state_entries where account_id = ?", values: [accountId] },
		{ text: "select id from accounts where id = ?", values: [accountId] },
	]);
});

test("trial row cleanup counts each remaining child or parent row", async () => {
	for (const index of [3, 4, 5]) {
		const results = Array.from({ length: 6 }, () => []);
		results[index] = [{}];
		const { sql } = sqlRecorder(results);
		assert.equal(await deleteRows(sql, busTrialPlan(env).accountId), 1);
	}
});
