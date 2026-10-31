// Runs each TLA+ model when packages/statecharts changed from origin/main,
// or when a file named by a model's `# model:` comment changed.
// A diff that cannot be read runs the models. The generated chart must match git.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

export function isStateDiagram(text) {
	return text.includes("stateDiagram-v2");
}

function modelFiles(spec) {
	const text = readFileSync(spec, "utf8");
	return [...text.matchAll(/^\\\*\s*#\s*model:\s*(\S+)/gm)].map((match) => match[1]);
}

function watchedPaths() {
	const paths = ["packages/statecharts"];
	for (const spec of modelsIn(charts)) {
		paths.push(...modelFiles(spec));
	}
	return paths;
}

function shouldRun() {
	try {
		const paths = watchedPaths();
		let revisions = ["origin/main"];
		if (process.env.GITHUB_EVENT_NAME === "push" && process.env.GITHUB_EVENT_PATH) {
			const { before } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
			if (typeof before === "string" && /^[a-f0-9]{40}$/i.test(before) && !/^0+$/.test(before)) {
				revisions = [before, "HEAD"];
			}
		}
		const changed = gitText(["diff", "--name-only", ...revisions, "--", ...paths]);
		const untracked = gitText(["ls-files", "--others", "--exclude-standard", "--", ...paths]);
		return `${changed}${untracked}`.trim().length > 0;
	} catch {
		console.log("statechart:check cannot read the comparison, so it runs.");
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
	const chart = join(dir, "chart.mmd");
	if (!existsSync(chart) || !isStateDiagram(readFileSync(chart, "utf8"))) {
		console.error(`statechart:check ${chart} is not a stateDiagram-v2 chart.`);
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
		child.on("close", (code) => {
			const status = code ?? 1;
			if (status !== 0) {
				finish(status);
				return;
			}
			const generated = join(out, "chart.mmd");
			if (!existsSync(generated)) {
				console.error(`statechart:check ${base} generated no chart.mmd.`);
				finish(1);
				return;
			}
			const fresh = readFileSync(generated, "utf8");
			const committed = readFileSync(chart, "utf8");
			if (fresh !== committed) {
				console.error(`statechart:check ${chart} does not match the generated chart.`);
				finish(1);
				return;
			}
			finish(0);
		});
	});
}

const invoked = import.meta.url === pathToFileURL(process.argv[1]).href;

if (invoked && !shouldRun()) {
	console.log("statechart:check skipped. packages/statecharts and the named model files have no changes.");
	process.exit(0);
}

if (invoked) {
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
}
