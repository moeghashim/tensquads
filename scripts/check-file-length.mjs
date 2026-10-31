import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MAX_LINES = Number(process.env.MAX_FILE_LINES ?? 600);

const ROOT = process.cwd();
const INCLUDE_DIRS = ["apps", "packages"];
const INCLUDE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);
const EXCLUDE_DIR_NAMES = new Set(["node_modules", "dist", "build", ".git", ".next", ".open-next", ".wrangler"]);

function walk(dir, out = []) {
	for (const name of readdirSync(dir)) {
		if (EXCLUDE_DIR_NAMES.has(name)) {
			continue;
		}

		const path = join(dir, name);
		const stat = statSync(path);

		if (stat.isDirectory()) {
			walk(path, out);
			continue;
		}

		const extension = name.slice(name.lastIndexOf("."));
		if (INCLUDE_EXTENSIONS.has(extension)) {
			out.push(path);
		}
	}

	return out;
}

function countLines(text) {
	return text === "" ? 0 : text.split("\n").length;
}

let failed = false;

for (const topLevelDir of INCLUDE_DIRS) {
	const absoluteDir = join(ROOT, topLevelDir);
	if (!existsSync(absoluteDir)) {
		continue;
	}

	for (const file of walk(absoluteDir)) {
		const content = readFileSync(file, "utf8");
		const lines = countLines(content);

		if (lines > MAX_LINES) {
			const relativePath = file.replace(`${ROOT}/`, "");
			console.error(`File too long: ${relativePath} has ${lines} lines (max ${MAX_LINES})`);
			failed = true;
		}
	}
}

if (failed) {
	process.exit(1);
}

console.log(`File length check passed (max ${MAX_LINES} lines).`);
