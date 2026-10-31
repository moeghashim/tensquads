#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function usage() {
	console.error(
		'Usage: npm run commit:with-progress -- "<type(scope): summary>" --learning "<learning>" -- <path1> <path2> ...',
	);
}

function fail(message) {
	console.error(`commit-with-progress: ${message}`);
	process.exit(1);
}

function run(command, args) {
	const result = spawnSync(command, args, { stdio: "inherit" });
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

function parseArgs(argv) {
	if (argv.length === 0) {
		usage();
		fail("commit message is required");
	}

	const message = argv[0].trim();
	if (message.length === 0 || message.startsWith("--")) {
		usage();
		fail("first argument must be the commit message");
	}

	let learning = "";
	const files = [];
	let index = 1;
	let filesMode = false;

	while (index < argv.length) {
		const arg = argv[index];

		if (filesMode) {
			files.push(arg);
			index += 1;
			continue;
		}

		if (arg === "--") {
			filesMode = true;
			index += 1;
			continue;
		}

		if (arg === "--learning") {
			const value = argv[index + 1];
			if (value === undefined) {
				usage();
				fail("missing value for --learning");
			}
			learning = value.trim();
			index += 2;
			continue;
		}

		usage();
		fail(`unknown argument: ${arg}`);
	}

	if (learning.length === 0) {
		fail('learning must not be empty; pass --learning "..."');
	}

	if (files.length === 0) {
		fail("at least one path is required after --");
	}

	return {
		message,
		learning,
		files: files.map((file) => file.trim()).filter((file) => file.length > 0),
	};
}

const { message, learning, files } = parseArgs(process.argv.slice(2));
if (files.length === 0) {
	fail("all provided file paths were empty");
}

run("node", [
	"scripts/progress-log.mjs",
	"append",
	"--trigger",
	"commit",
	"--learning",
	learning,
	"--message",
	message,
	"--files",
	files.join(","),
]);

const commitFiles = [...files];
if (!commitFiles.includes("progress.md")) {
	commitFiles.push("progress.md");
}

run("bash", ["scripts/committer", message, ...commitFiles]);
