// Runs each TLA+ model when packages/statecharts changed from origin/main.
// A diff that cannot be read runs the models. The statechart tool caches Java and TLC.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const charts = join(root, "packages/statecharts");
const runner = join(root, ".agents/skills/statechart/scripts/statechart");

function gitText(args) {
	return execFileSync("git", args, {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function shouldRun() {
	try {
		const changed = gitText(["diff", "--name-only", "origin/main", "--", "packages/statecharts"]);
		const untracked = gitText(["ls-files", "--others", "--exclude-standard", "--", "packages/statecharts"]);
		return `${changed}${untracked}`.trim().length > 0;
	} catch {
		console.log("statechart:check cannot read the diff from origin/main, so it runs.");
		return true;
	}
}

function modelsIn(dir) {
	if (!existsSync(dir)) {
		return [];
	}
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) {
			return modelsIn(path);
		}
		return name.endsWith(".tla") ? [path] : [];
	});
}

function runModel(spec) {
	const dir = dirname(spec);
	const base = basename(spec, ".tla");
	const config = join(dir, `${base}.cfg`);
	const view = join(dir, "view.mjs");
	if (!existsSync(config) || !existsSync(view)) {
		console.error(`statechart:check ${spec} needs ${base}.cfg and view.mjs beside the spec.`);
		return Promise.resolve(1);
	}
	const out = mkdtempSync(join(tmpdir(), "tensquads-statechart-"));
	return new Promise((resolveCode) => {
		const child = spawn(runner, [spec, "--config", config, "--view", view, "--out", out], {
			cwd: root,
			stdio: "inherit",
		});
		const finish = (code) => {
			rmSync(out, { recursive: true, force: true });
			resolveCode(code);
		};
		child.on("error", (error) => {
			console.error(error.message);
			finish(1);
		});
		child.on("close", (code) => finish(code ?? 1));
	});
}

if (!shouldRun()) {
	console.log("statechart:check skipped. packages/statecharts matches origin/main.");
	process.exit(0);
}

const models = modelsIn(charts);
if (models.length === 0) {
	console.error("statechart:check found no model under packages/statecharts.");
	process.exit(1);
}

const codes = await Promise.all(models.map((spec) => runModel(spec)));
const failed = codes.filter((code) => code !== 0).length;
if (failed > 0) {
	console.error(`statechart:check failed ${failed} of ${models.length} model(s).`);
	process.exit(1);
}
console.log(`statechart:check passed ${models.length} model(s).`);
