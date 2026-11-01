#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";

const PROGRESS_PATH = "progress.md";

function fail(message) {
	console.error(`progress-append-only-check: ${message}`);
	process.exit(1);
}

function commandSucceeds(command, args) {
	const result = spawnSync(command, args, { stdio: "ignore" });
	return result.status === 0;
}

function readCommand(command, args) {
	return execFileSync(command, args, { encoding: "utf8" });
}

const stagedNames = readCommand("git", ["diff", "--cached", "--name-only", "--", PROGRESS_PATH]).trim();
if (stagedNames.length === 0) {
	process.exit(0);
}

const existsInHead = commandSucceeds("git", ["cat-file", "-e", `HEAD:${PROGRESS_PATH}`]);
if (!existsInHead) {
	process.exit(0);
}

const previousContent = readCommand("git", ["show", `HEAD:${PROGRESS_PATH}`]);
const stagedContent = readCommand("git", ["show", `:${PROGRESS_PATH}`]);

if (!stagedContent.startsWith(previousContent)) {
	fail(`${PROGRESS_PATH} must be append-only. Add entries to the end; do not edit previous lines.`);
}
