import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { deployPlan, runDeploy } from "../deploy-cloudflare.mjs";

const projectAccount = "678c5a795f40f7e9f33b8a71248cc829";
const blocked = [
	"CF_API_TOKEN",
	"CLOUDFLARE_API_KEY",
	"CF_API_KEY",
	"CLOUDFLARE_EMAIL",
	"CF_EMAIL",
	"CLOUDFLARE_API_USER_SERVICE_KEY",
	"CLOUDFLARE_ACCOUNT_ID",
	"CF_ACCOUNT_ID",
	"WRANGLER_LOG",
];

test("wrangler config pins the project account", () => {
	const text = readFileSync(new URL("../../apps/web/wrangler.jsonc", import.meta.url), "utf8");
	const config = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
	assert.equal(config.account_id, projectAccount);
	assert.equal(config.vars.ADAPTERS, "test");
	assert.equal(config.browser, undefined);
	assert.equal(config.env.real.vars.ADAPTERS, "real");
	assert.equal(config.env.real.browser.binding, "BROWSER");
	assert.equal(/"ADAPTERS"\s*:\s*"([^"]*)"/.exec(text)?.[1], "test");
});

test("cf:deploy uses the deploy script", () => {
	const pkg = JSON.parse(readFileSync(new URL("../../apps/web/package.json", import.meta.url), "utf8"));
	assert.equal(pkg.scripts["cf:deploy"], "vite build && node ../../scripts/deploy-cloudflare.mjs");
});

test("deploy stops when the project token is absent", async () => {
	for (const envText of [
		"",
		"CLOUDFLARE_WORKERS_API_TOKEN=\n",
		"CLOUDFLARE_WORKERS_API_TOKEN=   \n",
		'CLOUDFLARE_WORKERS_API_TOKEN=" "\n',
		"CLOUDFLARE_WORKERS_API_TOKEN=' \t '\n",
		"OTHER=1\n",
	]) {
		const errors = [];
		const original = console.error;
		console.error = (message) => {
			errors.push(message);
		};
		try {
			let spawned = false;
			const code = await runDeploy({
				envText,
				parentEnv: { CLOUDFLARE_API_TOKEN: "personal-token" },
				spawn() {
					spawned = true;
					return { status: 0 };
				},
			});
			assert.equal(code, 1);
			assert.equal(spawned, false);
			assert.deepEqual(errors, ["CLOUDFLARE_WORKERS_API_TOKEN is absent."]);
		} finally {
			console.error = original;
		}
	}
});

test("deploy maps the project token and drops OAuth credentials", async () => {
	const parentEnv = {
		PATH: "/usr/bin",
		CLOUDFLARE_API_TOKEN: "personal-token",
		CF_API_TOKEN: "personal-cf-token",
		CLOUDFLARE_API_KEY: "personal-key",
		CF_API_KEY: "personal-cf-key",
		CLOUDFLARE_EMAIL: "person@example.com",
		CF_EMAIL: "person@example.com",
		CLOUDFLARE_API_USER_SERVICE_KEY: "service-key",
		CLOUDFLARE_ACCOUNT_ID: "personal-account",
		CF_ACCOUNT_ID: "personal-account",
		WRANGLER_LOG: "debug",
		CI: "",
	};
	let seen;
	const code = await runDeploy({
		envText:
			'CLOUDFLARE_WORKERS_API_TOKEN="project-token"\nCLOUDFLARE_API_TOKEN=ignored\nNEON_POSTGRES_CONNECTION_STRING="postgres://migrate-stub/db"\n',
		parentEnv,
		async migrate() {},
		spawn(command, args, options) {
			seen = { command, args, options };
			return { status: 0 };
		},
	});
	assert.equal(code, 0);
	assert.equal(seen.options.env.CLOUDFLARE_API_TOKEN, "project-token");
	assert.equal(seen.options.env.CI, "true");
	assert.equal(seen.options.stdio, "inherit");
	assert.equal(seen.command, process.execPath);
	assert.deepEqual(seen.args, [
		fileURLToPath(new URL("../../node_modules/wrangler/bin/wrangler.js", import.meta.url)),
		"deploy",
	]);
	assert.equal(seen.options.cwd, fileURLToPath(new URL("../../apps/web", import.meta.url)));
	for (const key of blocked) {
		assert.equal(seen.options.env[key], undefined);
	}
	assert.equal(parentEnv.CLOUDFLARE_API_TOKEN, "personal-token");
	assert.equal(deployPlan("", parentEnv).ok, false);
});

test("deploy migrates before it deploys and stops when migration fails", async () => {
	const envText =
		'CLOUDFLARE_WORKERS_API_TOKEN="project-token"\nNEON_POSTGRES_CONNECTION_STRING="postgres://migrate-stub/db"\n';
	const parentEnv = { PATH: "/usr/bin" };
	const order = [];
	const code = await runDeploy({
		envText,
		parentEnv,
		async migrate(connection) {
			order.push(connection);
		},
		spawn() {
			order.push("deploy");
			return { status: 0 };
		},
	});
	assert.equal(code, 0);
	assert.deepEqual(order, ["postgres://migrate-stub/db", "deploy"]);

	let spawned = false;
	const errors = [];
	const original = console.error;
	console.error = (message) => {
		errors.push(message);
	};
	try {
		const failed = await runDeploy({
			envText,
			parentEnv,
			async migrate() {
				throw new Error("migration failed");
			},
			spawn() {
				spawned = true;
				return { status: 0 };
			},
		});
		assert.equal(failed, 1);
		assert.equal(spawned, false);
		assert.deepEqual(errors, ["The database migration did not finish."]);
	} finally {
		console.error = original;
	}
});
