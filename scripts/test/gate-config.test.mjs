import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

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
