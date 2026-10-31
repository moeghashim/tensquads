#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["packages", "apps"];
const EXTENSIONS = new Set([".ts", ".tsx"]);

function hasTypeScript(dir) {
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		return false;
	}

	for (const name of entries) {
		if (name === "node_modules" || name === "dist" || name === ".wrangler") {
			continue;
		}
		const path = join(dir, name);
		const stat = statSync(path);
		if (stat.isDirectory()) {
			if (hasTypeScript(path)) {
				return true;
			}
			continue;
		}
		const extension = name.slice(name.lastIndexOf("."));
		if (EXTENSIONS.has(extension)) {
			return true;
		}
	}

	return false;
}

if (!ROOTS.some((root) => hasTypeScript(root))) {
	console.log("typecheck: no TypeScript files yet.");
	process.exit(0);
}

const result = spawnSync("tsc", ["--noEmit"], { stdio: "inherit" });
process.exit(result.status ?? 1);
