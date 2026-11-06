#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import "./register-kit.mjs";

const repoRoot = join(import.meta.dirname, "..");
const kitInstalled = existsSync(join(repoRoot, "node_modules/@tensquads/agent-kit/package.json"));
const [mode, ...rest] = process.argv.slice(2);

if (mode === "check") {
	const project = rest[0];
	if (!project) {
		console.error("The typecheck project is missing.");
		process.exit(1);
	}
	if (!kitInstalled) {
		console.log("The agent kit is not installed. This typecheck was skipped.");
		process.exit(0);
	}
	const result = spawnSync("tsc", ["--noEmit", "-p", project], { stdio: "inherit" });
	process.exit(result.status ?? 1);
}

if (mode === "test") {
	const skip = new Set();
	for (let index = 0; index < rest.length; index += 1) {
		if (rest[index] !== "--skip") continue;
		const name = rest[index + 1];
		if (!name) {
			console.error("A skipped test file is missing.");
			process.exit(1);
		}
		skip.add(name);
		index += 1;
	}
	const files = readdirSync("test")
		.filter((name) => name.endsWith(".test.ts"))
		.filter((name) => kitInstalled || !skip.has(name))
		.map((name) => join("test", name));
	if (!kitInstalled && skip.size > 0) {
		console.log("The agent kit is not installed. Tests that import it were skipped.");
	}
	const result = spawnSync(
		process.execPath,
		["--experimental-strip-types", "--import", join(repoRoot, "scripts/register-kit.mjs"), "--test", ...files],
		{ stdio: "inherit" },
	);
	process.exit(result.status ?? 1);
}

console.error("Use check or test.");
process.exit(1);
