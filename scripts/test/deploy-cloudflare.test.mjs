import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
	const match = text.match(/"account_id"\s*:\s*"([^"]+)"/);
	assert.ok(match);
	assert.equal(match[1], projectAccount);
});

test("cf:deploy uses the deploy script", () => {
	const pkg = JSON.parse(readFileSync(new URL("../../apps/web/package.json", import.meta.url), "utf8"));
	assert.equal(pkg.scripts["cf:deploy"], "vite build && node ../../scripts/deploy-cloudflare.mjs");
});

test("foundation says deploy only through the script", () => {
	const text = readFileSync(new URL("../../docs/foundation.md", import.meta.url), "utf8");
	assert.match(text, /Deploy only through `npm run deploy:cloudflare`/);
	assert.match(text, /scripts\/deploy-cloudflare\.mjs/);
	assert.match(text, /does not use a Wrangler OAuth login/);
});

test("deploy stops when the project token is absent", () => {
	for (const envText of ["", "CLOUDFLARE_WORKERS_API_TOKEN=\n", "CLOUDFLARE_WORKERS_API_TOKEN=   \n", "OTHER=1\n"]) {
		const errors = [];
		const original = console.error;
		console.error = (message) => {
			errors.push(message);
		};
		try {
			let spawned = false;
			const code = runDeploy({
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

test("deploy maps the project token and drops OAuth credentials", () => {
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
	const code = runDeploy({
		envText: 'CLOUDFLARE_WORKERS_API_TOKEN="project-token"\nCLOUDFLARE_API_TOKEN=ignored\n',
		parentEnv,
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
	assert.deepEqual(seen.args.slice(1), ["deploy"]);
	assert.match(seen.args[0], /wrangler\/bin\/wrangler\.js$/);
	assert.match(seen.options.cwd, /apps\/web$/);
	for (const key of blocked) {
		assert.equal(seen.options.env[key], undefined);
	}
	assert.equal(parentEnv.CLOUDFLARE_API_TOKEN, "personal-token");
	assert.equal(deployPlan("", parentEnv).ok, false);
});
