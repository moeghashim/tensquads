#!/usr/bin/env node

import { execSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const PROGRESS_PATH = "progress.md";
const VALID_TRIGGERS = new Set(["commit", "deploy"]);
const VALID_BUMPS = new Set(["patch", "minor", "major"]);

function usage() {
	console.error(
		'Usage: node scripts/progress-log.mjs append --trigger <commit|deploy> --learning "<text>" [--message "<commit message>"] [--bump <patch|minor|major>] [--version <x.y.z>] [--files "<path1,path2,...>"]',
	);
}

function fail(message) {
	console.error(`progress-log: ${message}`);
	process.exit(1);
}

function readGit(command, fallback) {
	try {
		const value = execSync(command, { encoding: "utf8" }).trim();
		return value.length > 0 ? value : fallback;
	} catch {
		return fallback;
	}
}

function normalizeSingleLine(value) {
	return value.replace(/\s+/g, " ").trim();
}

function parseFiles(value) {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

function validateOptions(options) {
	if (!VALID_TRIGGERS.has(options.trigger)) {
		fail('trigger must be one of: "commit", "deploy"');
	}

	if (normalizeSingleLine(options.learning).length === 0) {
		fail("learning must not be empty");
	}

	if (!["", ...VALID_BUMPS].includes(options.bump)) {
		fail('bump must be one of: "patch", "minor", "major"');
	}
}

function requireOptionValue(arg, value) {
	if (!arg.startsWith("--")) {
		usage();
		fail(`unexpected positional argument: ${arg}`);
	}
	if (value === undefined) {
		usage();
		fail(`missing value for ${arg}`);
	}
}

function readOptions(argv, options) {
	let index = 1;
	while (index < argv.length) {
		const arg = argv[index];
		const value = argv[index + 1];
		requireOptionValue(arg, value);

		const key = arg.slice(2);
		if (!Object.hasOwn(options, key)) {
			usage();
			fail(`unknown flag: ${arg}`);
		}
		options[key] = key === "files" ? parseFiles(value) : value;

		index += 2;
	}
}

function parseArgs(argv) {
	if (argv[0] !== "append") {
		usage();
		fail("only the 'append' command is supported");
	}

	const options = {
		trigger: "",
		learning: "",
		message: "",
		bump: "",
		version: "",
		files: [],
	};

	readOptions(argv, options);

	validateOptions(options);

	return {
		trigger: options.trigger,
		learning: normalizeSingleLine(options.learning),
		message: normalizeSingleLine(options.message),
		bump: options.bump,
		version: normalizeSingleLine(options.version),
		files: options.files,
	};
}

function buildContext({ trigger, message, bump, version }) {
	if (trigger === "commit") {
		return message.length > 0 ? message : "n/a";
	}

	return (
		Object.entries({ bump, version })
			.filter(([, value]) => value.length > 0)
			.map(([key, value]) => `${key}=${value}`)
			.join("; ") || "n/a"
	);
}

function buildEntry({ trigger, learning, context, branch, actor, files }) {
	const lines = [
		`## ${new Date().toISOString()}`,
		`- Trigger: ${trigger}`,
		`- Learning: ${learning}`,
		`- Context: ${context}`,
		`- Branch: ${branch}`,
		`- Actor: ${actor}`,
	];

	if (trigger === "commit") {
		if (files.length > 0) {
			lines.push("- Changed Paths:");
			for (const file of files) {
				lines.push(`  - ${file}`);
			}
		} else {
			lines.push("- Changed Paths: n/a");
		}
	}

	lines.push("");
	return lines.join("\n");
}

if (!existsSync(PROGRESS_PATH)) {
	fail(`${PROGRESS_PATH} is missing`);
}

const parsed = parseArgs(process.argv.slice(2));
const branch = readGit("git rev-parse --abbrev-ref HEAD", "unknown");
const authorName = readGit("git config user.name", "unknown");
const authorEmail = readGit("git config user.email", "unknown");
const actor = `${authorName} <${authorEmail}>`;
const context = buildContext(parsed);
const entry = buildEntry({
	trigger: parsed.trigger,
	learning: parsed.learning,
	context,
	branch,
	actor,
	files: parsed.files,
});

const currentContent = readFileSync(PROGRESS_PATH, "utf8");
const needsLeadingNewline = currentContent.length > 0 && !currentContent.endsWith("\n");
const prefix = needsLeadingNewline ? "\n" : "";

appendFileSync(PROGRESS_PATH, `${prefix}${entry}`, "utf8");
