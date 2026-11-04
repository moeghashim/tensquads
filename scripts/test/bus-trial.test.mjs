import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { busTrialPlan, childEnv, executeBusTrial, redact, trialConfig } from "../bus-trial.mjs";

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
					return { stdout: "Published https://tensquads-trial-41877304107.example.workers.dev\n" };
				}
				return { stdout: "" };
			},
			async fetch() {
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
	assert.match(calls.at(-1), /^bus-trial run=41877304107 event=trial-41877304107$/);
});
