import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { deployPlan } from "./deploy-cloudflare.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const secretsPath = resolve(root, "apps/web/real-secrets.json");

const listFailed = "The secret list failed.";
const listInvalid = "The secret list was not a list.";

export function loadRealSecretNames(text) {
	const parsed = JSON.parse(text);
	if (!Array.isArray(parsed.secrets) || parsed.secrets.some((name) => typeof name !== "string" || name.length === 0)) {
		throw new Error("The real secret list is not valid.");
	}
	return parsed.secrets;
}

export function parseSecretNames(stdout) {
	const start = stdout.indexOf("[");
	if (start === -1) throw new Error(listInvalid);
	const parsed = JSON.parse(stdout.slice(start));
	if (!Array.isArray(parsed)) throw new Error(listInvalid);
	return parsed.map((item) => {
		if (!item || typeof item.name !== "string" || item.name.trim().length === 0) throw new Error(listInvalid);
		return item.name;
	});
}

export function missingSecrets(required, present) {
	const have = new Set(present);
	return required.filter((name) => !have.has(name));
}

function stop(message) {
	console.error(message);
	return 1;
}

export async function runSecretsCheck(options) {
	const plan = deployPlan(options.envText ?? "", options.parentEnv ?? {});
	if (!plan.ok) return stop(plan.message);
	const listed = options.spawn(plan.command, [plan.args[0], "secret", "list", "--env", "real"], {
		cwd: plan.cwd,
		env: plan.env,
		encoding: "utf8",
	});
	if (!listed || listed.error || listed.status !== 0 || typeof listed.stdout !== "string") return stop(listFailed);
	let names;
	try {
		names = parseSecretNames(listed.stdout);
	} catch {
		return stop(listInvalid);
	}
	const required = options.required ?? loadRealSecretNames(options.secretsText ?? readFileSync(secretsPath, "utf8"));
	const missing = missingSecrets(required, names);
	if (missing.length === 0) return 0;
	console.log(missing.join("\n"));
	return 1;
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
	if (!entry) return false;
	try {
		return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
	} catch {
		return pathToFileURL(entry).href === import.meta.url;
	}
}

if (isDirectRun()) {
	process.exit(
		await runSecretsCheck({
			envText: readEnvFile(),
			parentEnv: process.env,
			spawn: (command, args, options) => spawnSync(command, args, options),
		}),
	);
}
