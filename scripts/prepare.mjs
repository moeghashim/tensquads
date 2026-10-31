#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const skipReasons = [];

if (process.env.HUSKY === "0") {
	skipReasons.push("HUSKY=0");
}

if (process.env.CI) {
	skipReasons.push("CI");
}

if (process.env.VERCEL) {
	skipReasons.push("VERCEL");
}

if (!existsSync(".git")) {
	skipReasons.push("missing .git");
}

if (skipReasons.length > 0) {
	console.log(`Skipping Husky install (${skipReasons.join(", ")}).`);
	process.exit(0);
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const huskyBinPath = join(scriptDirectory, "..", "node_modules", "husky", "bin.js");

if (!existsSync(huskyBinPath)) {
	console.warn("Husky binary not found; skipping hook install.");
	process.exit(0);
}

const huskyProcess = spawnSync(process.execPath, [huskyBinPath], {
	stdio: "inherit",
});

if (huskyProcess.error) {
	throw huskyProcess.error;
}

process.exit(huskyProcess.status ?? 0);
