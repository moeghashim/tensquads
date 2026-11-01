#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Root tsc covers packages only. Each app runs its own check.
const ROOTS = ["packages"];
const EXTENSIONS = new Set([".ts", ".tsx"]);

function hasTypeScript(dir) {
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		return false;
	}

	return entries
		.filter((name) => !["node_modules", "dist", ".wrangler"].includes(name))
		.some((name) => {
			const path = join(dir, name);
			if (statSync(path).isDirectory()) {
				return hasTypeScript(path);
			}
			return EXTENSIONS.has(name.slice(name.lastIndexOf(".")));
		});
}

if (!ROOTS.some((root) => hasTypeScript(root))) {
	console.log("typecheck: no TypeScript files yet.");
	process.exit(0);
}

const result = spawnSync("tsc", ["--noEmit"], { stdio: "inherit" });
process.exit(result.status ?? 1);
