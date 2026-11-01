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
	return ["apps", "packages"].some((top) => {
		if (!existsSync(top)) {
			return false;
		}
		return readdirSync(top).some((name) => existsSync(join(top, name, "package.json")));
	});
}

if (!hasWorkspace()) {
	console.log(`workspaces: no package for "${scriptName}".`);
	process.exit(0);
}

const result = spawnSync("npm", ["run", scriptName, "--workspaces", "--if-present"], { stdio: "inherit" });
process.exit(result.status ?? 1);
