import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseEnv } from "./write-dev-vars.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const webDirectory = resolve(root, "apps/web");
const wranglerBin = resolve(root, "node_modules/wrangler/bin/wrangler.js");

// Wrangler prefers a global API key and email over an API token, and it reads
// stored OAuth when no environment credential is set. An empty token is not a credential.
const blockedEnvironment = [
	"CLOUDFLARE_API_TOKEN",
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

const absentMessage = "CLOUDFLARE_WORKERS_API_TOKEN is absent.";

function workersToken(envText) {
	const value = parseEnv(envText).get("CLOUDFLARE_WORKERS_API_TOKEN");
	if (typeof value !== "string" || value.length === 0) {
		return undefined;
	}
	return value;
}

function childEnvironment(parentEnv, token) {
	const env = { ...parentEnv };
	for (const key of blockedEnvironment) {
		delete env[key];
	}
	env.CLOUDFLARE_API_TOKEN = token;
	env.CI = "true";
	return env;
}

export function deployPlan(envText, parentEnv) {
	const token = workersToken(envText);
	if (token === undefined) {
		return { ok: false, message: absentMessage };
	}
	return {
		ok: true,
		command: process.execPath,
		args: [wranglerBin, "deploy"],
		cwd: webDirectory,
		env: childEnvironment(parentEnv, token),
		stdio: "inherit",
	};
}

function childStatus(result) {
	if (result.error) {
		console.error("Cloudflare deploy failed to start.");
		return 1;
	}
	if (result.status === 0) {
		return 0;
	}
	return result.status ?? 1;
}

export function runDeploy(options) {
	const plan = deployPlan(options.envText, options.parentEnv);
	if (!plan.ok) {
		console.error(plan.message);
		return 1;
	}
	return childStatus(
		options.spawn(plan.command, plan.args, {
			cwd: plan.cwd,
			env: plan.env,
			stdio: plan.stdio,
		}),
	);
}

function readEnvFile() {
	try {
		return readFileSync(resolve(root, ".env"), "utf8");
	} catch {
		return "";
	}
}

function isDirectRun() {
	const entry = process.argv[1];
	if (!entry) {
		return false;
	}
	try {
		return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
	} catch {
		return pathToFileURL(entry).href === import.meta.url;
	}
}

if (isDirectRun()) {
	process.exit(
		runDeploy({
			envText: readEnvFile(),
			parentEnv: process.env,
			spawn: (command, args, options) => spawnSync(command, args, options),
		}),
	);
}
