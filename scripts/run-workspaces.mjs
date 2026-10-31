#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const scriptName = process.argv[2];
if (!scriptName) {
	console.error("Usage: node scripts/run-workspaces.mjs <script>");
	process.exit(1);
}

function hasWorkspace() {
	for (const top of ["apps", "packages"]) {
		if (!existsSync(top)) {
			continue;
		}
		for (const name of readdirSync(top)) {
			if (existsSync(join(top, name, "package.json"))) {
				return true;
			}
		}
	}
	return false;
}

if (!hasWorkspace()) {
	console.log(`workspaces: no package for "${scriptName}".`);
	process.exit(0);
}

const result = spawnSync("npm", ["run", scriptName, "--workspaces", "--if-present"], { stdio: "inherit" });
process.exit(result.status ?? 1);
