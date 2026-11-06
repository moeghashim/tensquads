import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cliSpawn, namedConnection, readDotEnv, runAsCli } from "./cli-env.mjs";
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
const migrationMessage = "The database migration did not finish.";
const databaseMessage = "The database is not configured.";

function workersToken(envText) {
	const value = parseEnv(envText).get("CLOUDFLARE_WORKERS_API_TOKEN");
	if (typeof value !== "string" || value.trim().length === 0) {
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

function configuredDatabase(envText, parentEnv) {
	return namedConnection(envText, parentEnv, "NEON_POSTGRES_CONNECTION_STRING");
}

async function migrateDatabase(connection) {
	const { openPostgres } = await import("../packages/adapters/src/neon/postgres.ts");
	const opened = openPostgres(connection);
	try {
		await opened.migrate();
	} finally {
		await opened.close();
	}
}

function stopDeploy(message) {
	console.error(message);
	return 1;
}

async function migrationFinished(options, connection) {
	try {
		await (options.migrate ?? migrateDatabase)(connection);
		return true;
	} catch {
		return false;
	}
}

export async function runDeploy(options) {
	const plan = deployPlan(options.envText, options.parentEnv);
	if (!plan.ok) return stopDeploy(plan.message);
	const connection = configuredDatabase(options.envText, options.parentEnv);
	if (connection === undefined) return stopDeploy(databaseMessage);
	if (!(await migrationFinished(options, connection))) return stopDeploy(migrationMessage);
	return childStatus(
		options.spawn(plan.command, plan.args, {
			cwd: plan.cwd,
			env: plan.env,
			stdio: plan.stdio,
		}),
	);
}

await runAsCli(import.meta.url, () =>
	runDeploy({
		envText: readDotEnv(root),
		parentEnv: process.env,
		spawn: cliSpawn,
	}),
);
