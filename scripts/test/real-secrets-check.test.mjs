import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { deployPlan } from "../deploy-cloudflare.mjs";
import { loadRealSecretNames, missingSecrets, parseSecretNames, runSecretsCheck } from "../real-secrets-check.mjs";

const rootPackage = JSON.parse(readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"));
const secretsText = readFileSync(fileURLToPath(new URL("../../apps/web/real-secrets.json", import.meta.url)), "utf8");

function capture(run) {
	const errors = [];
	const logs = [];
	const originalError = console.error;
	const originalLog = console.log;
	console.error = (message) => {
		errors.push(message);
	};
	console.log = (message) => {
		logs.push(message);
	};
	return run()
		.then((code) => ({ code, errors, logs }))
		.finally(() => {
			console.error = originalError;
			console.log = originalLog;
		});
}

test("real secrets check prints missing names and never a secret value", async () => {
	assert.equal(rootPackage.scripts["real:secrets-check"], "node scripts/real-secrets-check.mjs");
	const required = loadRealSecretNames(secretsText);
	assert.equal(required.includes("CLOUDFLARE_PAGES_API_TOKEN"), true);
	assert.equal(required.includes("BOAT_PROFILE"), false);
	assert.equal(required.includes("TEST_DATABASE_URL"), false);
	assert.deepEqual(missingSecrets(["OPENAI_API_KEY", "BOAT_TOKEN"], ["OPENAI_API_KEY"]), ["BOAT_TOKEN"]);
	assert.deepEqual(parseSecretNames('noise\n[{"name":"OPENAI_API_KEY","type":"secret_text"}]\n'), ["OPENAI_API_KEY"]);

	const present = required.filter((name) => name !== "CLOUDFLARE_PAGES_API_TOKEN" && name !== "DATABASE_URL");
	const stdout = JSON.stringify([
		...present.map((name) => ({ name, type: "secret_text", value: "super-secret-value" })),
		{ name: "EXTRA_TOKEN", value: "another-secret-value" },
	]);
	let seen;
	const result = await capture(() =>
		runSecretsCheck({
			envText: 'CLOUDFLARE_WORKERS_API_TOKEN="project-token"\n',
			parentEnv: { CLOUDFLARE_API_TOKEN: "personal-token" },
			secretsText,
			spawn(command, args, options) {
				seen = { command, args, options };
				return { status: 0, stdout };
			},
		}),
	);
	assert.equal(result.code, 1);
	assert.equal(result.logs.join("\n"), "CLOUDFLARE_PAGES_API_TOKEN\nDATABASE_URL");
	assert.equal(result.logs.join("\n").includes("super-secret-value"), false);
	assert.equal(result.logs.join("\n").includes("another-secret-value"), false);
	assert.equal(result.errors.join("\n").includes("project-token"), false);
	assert.equal(result.errors.join("\n").includes("personal-token"), false);
	const plan = deployPlan('CLOUDFLARE_WORKERS_API_TOKEN="project-token"\n', {});
	assert.equal(seen.command, plan.command);
	assert.deepEqual(seen.args.slice(1), ["secret", "list", "--env", "real"]);
	assert.equal(seen.options.env.CLOUDFLARE_API_TOKEN, "project-token");
	assert.equal(seen.options.env.CI, "true");
	assert.equal(seen.options.cwd, fileURLToPath(new URL("../../apps/web", import.meta.url)));

	const ready = await capture(() =>
		runSecretsCheck({
			envText: 'CLOUDFLARE_WORKERS_API_TOKEN="project-token"\n',
			parentEnv: {},
			required: ["OPENAI_API_KEY"],
			spawn() {
				return { status: 0, stdout: '[{"name":"OPENAI_API_KEY","value":"super-secret-value"}]' };
			},
		}),
	);
	assert.equal(ready.code, 0);
	assert.deepEqual(ready.logs, []);
	assert.equal(ready.logs.join("").includes("super-secret-value"), false);
});

test("real secrets check stops when the secret list fails and does not print it", async () => {
	const result = await capture(() =>
		runSecretsCheck({
			envText: 'CLOUDFLARE_WORKERS_API_TOKEN="project-token"\n',
			parentEnv: {},
			required: ["OPENAI_API_KEY"],
			spawn() {
				return {
					status: 1,
					stdout: '[{"name":"OPENAI_API_KEY","value":"super-secret-value"}]',
					stderr: "wrangler failed super-secret-value",
				};
			},
		}),
	);
	assert.equal(result.code, 1);
	assert.deepEqual(result.errors, ["The secret list failed."]);
	assert.deepEqual(result.logs, []);
	assert.equal(`${result.errors.join("\n")}\n${result.logs.join("\n")}`.includes("super-secret-value"), false);
});

test("real secrets check stops when the secret list is not a list and does not print it", async () => {
	const result = await capture(() =>
		runSecretsCheck({
			envText: 'CLOUDFLARE_WORKERS_API_TOKEN="project-token"\n',
			parentEnv: {},
			required: ["OPENAI_API_KEY"],
			spawn() {
				return { status: 0, stdout: "not-a-list super-secret-value", stderr: "super-secret-value" };
			},
		}),
	);
	assert.equal(result.code, 1);
	assert.deepEqual(result.errors, ["The secret list was not a list."]);
	assert.deepEqual(result.logs, []);
	assert.equal(`${result.errors.join("\n")}\n${result.logs.join("\n")}`.includes("super-secret-value"), false);
});
