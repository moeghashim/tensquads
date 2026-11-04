import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";
import { suitePlan } from "../e2e-plan.mjs";
import { parseToolToml } from "./parse-tool-toml.mjs";

const root = new URL("../../", import.meta.url);
const gate = parse(readFileSync(new URL(".no-mistakes.yaml", root), "utf8"));
const workflow = parse(readFileSync(new URL(".github/workflows/ci.yml", root), "utf8"));

test("gate commands reach npm with the .nvmrc Node on PATH and no nvm", () => {
	for (const command of [gate.commands.test, gate.commands.lint]) {
		const result = spawnSync("sh", ["-c", `npm() { exit 42; }; ${command}`], {
			cwd: root,
			env: { ...process.env, NVM_DIR: "/nonexistent-tensquads-nvm" },
			encoding: "utf8",
		});
		assert.equal(result.status, 42, result.stderr);
	}
});

function assertDependencyResult(job, step, event, result, dependency) {
	const needs = Object.fromEntries(job.needs.map((name) => [name, { result: "success" }]));
	needs[dependency].result = result;
	const run = spawnSync("bash", ["-c", step.run], {
		cwd: root,
		env: { ...process.env, NEEDS_JSON: JSON.stringify(needs), EVENT_NAME: event },
		encoding: "utf8",
	});
	const allowed =
		result === "success" || (dependency === "fallow-audit" && event !== "pull_request" && result === "skipped");
	assert.equal(run.status === 0, allowed, `${event}: ${dependency} ${result}: ${run.stderr}`);
}

test("no-mistakes makes no commits and does not declare a sign-off trailer", () => {
	assert.equal(gate.commit, undefined);
	assert.ok(gate.auto_fix);
	for (const [name, value] of Object.entries(gate.auto_fix)) {
		assert.equal(value, 0, name);
	}
	const text = readFileSync(new URL(".no-mistakes.yaml", root), "utf8");
	assert.equal(/^\s*trailers\s*:/m.test(text), false);
});

test("mise.toml pins the TLC jar the model tests resolve", () => {
	const toml = parseToolToml(readFileSync(new URL("mise.toml", root), "utf8"));
	const lock = parseToolToml(readFileSync(new URL("mise.lock", root), "utf8"));
	assert.deepEqual(toml.tools["http:tla2tools"], {
		version: "1.7.4",
		url: "https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar",
		checksum: "sha256:936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88",
	});
	assert.deepEqual(lock.tools["http:tla2tools"], [{ version: "1.7.4", backend: "http:tla2tools" }]);
});

test("tool TOML comments cannot supply tool settings", () => {
	for (const file of ["mise.toml", "mise.lock"]) {
		const text = readFileSync(new URL(file, root), "utf8");
		const comments = text
			.split("\n")
			.map((line) => `# ${line}`)
			.join("\n");
		assert.deepEqual(parseToolToml(comments), {});
		assert.deepEqual(parseToolToml(`${comments}\n[tools]\njava = "temurin-25" # ignored`), {
			tools: { java: "temurin-25" },
		});
	}
});

for (const [ci, platform, cpuCount, workers] of [
	[true, "darwin", 3, ["--workers=3"]],
	[true, "darwin", 1, ["--workers=2"]],
	[false, "darwin", 3, []],
	[true, "linux", 3, []],
	[false, "linux", 3, []],
]) {
	test(`Playwright suite plan: ci=${ci}, platform=${platform}, cpus=${cpuCount}`, () => {
		const held = "a held account read commits no limit|a read held past the deadline cannot commit the queued writes";
		assert.deepEqual(suitePlan(ci, platform, cpuCount), [
			["--project", "app", "--grep-invert", held, ...workers],
			["--project", "rules-fence", "--workers=1"],
			["--project", "app", "--workers=1", "--grep", held],
		]);
	});
}

test("the mise cache is saved by actions/cache and keyed by the lock hash", () => {
	const job = workflow.jobs["required-checks"];
	const cache = job.steps.find((step) => String(step.uses ?? "").startsWith("actions/cache@"));
	assert.ok(cache, "required-checks saves the mise cache");
	assert.match(cache.with.key, /^mise-\$\{\{ runner\.os \}\}-\$\{\{ hashFiles\('mise\.lock'\) \}\}$/);
	assert.match(cache.with.path, /~\/\.local\/share\/mise/);
	assert.match(cache.with.path, /~\/\.cache\/mise/);
	const mise = job.steps.find((step) => String(step.uses ?? "").includes("jdx/mise-action@"));
	assert.equal(mise.with.install, false);
	assert.equal(mise.with.cache, false);
});

test("stable Required checks job fails closed for failed, skipped or cancelled dependencies", () => {
	const job = Object.values(workflow.jobs).find(
		(candidate) => candidate.name === "Required checks" && !candidate.strategy,
	);
	assert.ok(job, "branch protection needs a non-matrix Required checks job");
	assert.equal(job.if, `\${{ always() }}`);
	assert.deepEqual(new Set(job.needs), new Set(["required-checks", "cloudflare-build", "fallow-audit"]));
	const step = job.steps.find((candidate) => candidate.run);
	assert.ok(step);
	for (const event of ["pull_request", "push", "workflow_dispatch"]) {
		for (const result of ["success", "failure", "cancelled", "skipped"]) {
			for (const dependency of job.needs) {
				assertDependencyResult(job, step, event, result, dependency);
			}
		}
	}
});
