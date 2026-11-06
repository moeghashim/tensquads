import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseEnv } from "./write-dev-vars.mjs";

export function readDotEnv(root) {
	try {
		return readFileSync(resolve(root, ".env"), "utf8");
	} catch {
		return "";
	}
}

function isDirectRun(metaUrl) {
	const entry = process.argv[1];
	if (!entry) return false;
	try {
		return realpathSync(entry) === realpathSync(fileURLToPath(metaUrl));
	} catch {
		return pathToFileURL(entry).href === metaUrl;
	}
}

export function namedConnection(envText, parentEnv, name) {
	const fromFile = parseEnv(envText).get(name);
	const fromParent = parentEnv?.[name];
	const value = [fromParent, fromFile].find((item) => typeof item === "string" && item.trim().length > 0);
	return typeof value === "string" ? value.trim() : undefined;
}

export function cliSpawn(command, args, options) {
	return spawnSync(command, args, options);
}

export async function runAsCli(metaUrl, start) {
	if (!isDirectRun(metaUrl)) return;
	process.exit(await start());
}
