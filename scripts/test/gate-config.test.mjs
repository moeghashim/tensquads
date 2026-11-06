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
	const entry = lock.tools["http:tla2tools"][0];
	assert.equal(entry.version, "1.7.4");
	assert.equal(entry.backend, "http:tla2tools");
	for (const platform of Object.values(entry.platforms ?? {})) {
		assert.equal(platform.url, "https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar");
	}
});

test("tool TOML nested tables belong to the most recent array entry", () => {
	const parsed = parseToolToml(`
[[tools."http:tla2tools"]]
version = "1.7.3"
[[tools."http:tla2tools"]]
version = "1.7.4"
[tools."http:tla2tools".platforms.linux-x64]
url = "https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar"
checksum = "blake3:example"
[[tools."http:tla2tools".mirrors]]
url = "https://example.com/tla2tools.jar"
`);
	assert.deepEqual(parsed, {
		tools: {
			"http:tla2tools": [
				{ version: "1.7.3" },
				{
					version: "1.7.4",
					platforms: {
						"linux-x64": {
							url: "https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar",
							checksum: "blake3:example",
						},
					},
					mirrors: [{ url: "https://example.com/tla2tools.jar" }],
				},
			],
		},
	});
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

function evaluateExpression(expression, context) {
	if (typeof expression === "boolean") return expression;
	let source = expression.trim();
	if (source.startsWith("${{") && source.endsWith("}}")) source = source.slice(3, -2).trim();
	const tokens = [];
	const token = /\s*('(?:[^']|'')*'|==|!=|&&|\|\||[(),]|[a-zA-Z_][a-zA-Z_0-9.]*)/y;
	let offset = 0;
	while (offset < source.length) {
		token.lastIndex = offset;
		const match = token.exec(source);
		if (!match) throw new Error(`Unsupported expression: ${source.slice(offset)}`);
		tokens.push(match[1]);
		offset = token.lastIndex;
	}
	let index = 0;
	function take(expected) {
		assert.equal(tokens[index++], expected);
	}
	function primary() {
		const value = tokens[index++];
		if (value === "(") {
			const result = logicalOr();
			take(")");
			return result;
		}
		if (value === "true" || value === "false") return value === "true";
		if (value?.startsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
		if (value === "format") {
			take("(");
			const pattern = logicalOr();
			const args = [];
			while (tokens[index] === ",") {
				take(",");
				args.push(logicalOr());
			}
			take(")");
			return pattern.replace(/\{([01])\}/g, (_match, position) => String(args[Number(position)]));
		}
		if (Object.hasOwn(context, value)) return context[value];
		throw new Error(`Unsupported expression value: ${value}`);
	}
	function equality() {
		let result = primary();
		while (tokens[index] === "==" || tokens[index] === "!=") {
			const operator = tokens[index++];
			const right = primary();
			result = operator === "==" ? result === right : result !== right;
		}
		return result;
	}
	function logicalAnd() {
		let result = equality();
		while (tokens[index] === "&&") {
			take("&&");
			const right = equality();
			result = result && right;
		}
		return result;
	}
	function logicalOr() {
		let result = logicalAnd();
		while (tokens[index] === "||") {
			take("||");
			const right = logicalAnd();
			result = result || right;
		}
		return result;
	}
	const result = logicalOr();
	assert.equal(index, tokens.length);
	return result;
}

function expressionContext(event, inputs = {}) {
	return {
		"github.event_name": event,
		"github.run_id": "123456",
		"github.workflow": "CI",
		"github.ref": "refs/heads/04-machine-trial",
		"inputs.machine_trial": inputs.machine_trial ?? false,
		"inputs.bus_trial": inputs.bus_trial ?? false,
	};
}

function assertTrialSchedule(machineIf, busIf) {
	for (const [event, machine, bus, expectedMachine, expectedBus] of [
		["workflow_dispatch", true, false, true, false],
		["workflow_dispatch", false, true, false, true],
		["workflow_dispatch", false, false, false, false],
		["push", true, true, false, false],
		["pull_request", true, true, false, false],
	]) {
		const context = expressionContext(event, { machine_trial: machine, bus_trial: bus });
		assert.equal(evaluateExpression(machineIf, context), expectedMachine, `${event}: machine trial`);
		assert.equal(evaluateExpression(busIf, context), expectedBus, `${event}: bus trial`);
	}
	const missing = expressionContext("workflow_dispatch");
	assert.equal(evaluateExpression(machineIf, missing), false);
	assert.equal(evaluateExpression(busIf, missing), false);
}

test("trial scheduling rejects an unconditional acceptance branch", () => {
	assert.throws(
		() =>
			assertTrialSchedule(
				"true || (github.event_name == 'workflow_dispatch' && inputs.machine_trial)",
				workflow.jobs["bus-trial"].if,
			),
		{ code: "ERR_ASSERTION" },
	);
	assert.throws(
		() =>
			assertTrialSchedule(
				workflow.jobs["machine-trial"].if,
				"true || (github.event_name == 'workflow_dispatch' && inputs.bus_trial)",
			),
		{ code: "ERR_ASSERTION" },
	);
});

test("the machine trial is a manual job and the bus trial stays off", () => {
	assert.equal(workflow.on.workflow_dispatch.inputs.machine_trial.type, "boolean");
	assert.equal(workflow.on.workflow_dispatch.inputs.machine_trial.default, false);
	assert.equal(workflow.on.workflow_dispatch.inputs.bus_trial.type, "boolean");
	assert.equal(workflow.on.workflow_dispatch.inputs.bus_trial.default, false);
	assert.equal(workflow.on.pull_request.branches.includes("main"), true);
	assert.equal(workflow.on.push.branches.includes("main"), true);
	const machine = workflow.jobs["machine-trial"];
	assert.deepEqual(machine.concurrency, { group: "machine-trial", "cancel-in-progress": false });
	assert.equal(machine["timeout-minutes"], 20);
	const machineProof = machine.steps.find((step) => step.name === "Prove one real machine");
	assert.equal(
		machineProof.run,
		"node --experimental-strip-types --test --test-force-exit packages/adapters/test/live/machine-trial.test.ts",
	);
	assert.equal(machineProof.env.MACHINE_TRIAL, "1");
	const machineCleanup = machine.steps.find((step) => step.name === "Remove the trial machines");
	assert.equal(machineCleanup.if, "always()");
	assert.equal(machineCleanup.run, "node --experimental-strip-types packages/adapters/test/live/cleanup.ts");
	const bus = workflow.jobs["bus-trial"];
	assert.equal(bus.concurrency, undefined);
	const busProof = bus.steps.find((step) => step.name === "Prove one real queue delivery");
	assert.equal(busProof.run, "node --experimental-strip-types scripts/bus-trial.mjs");
	const busCleanup = bus.steps.find((step) => step.name === "Remove the trial bus");
	assert.equal(busCleanup.if, "always()");
	assert.equal(busCleanup.run, "node --experimental-strip-types scripts/bus-trial.mjs");
	assertTrialSchedule(machine.if, bus.if);
	const kitKey = bus.steps.find((step) => step.name === "Load the kit deploy key");
	assert.equal(kitKey.env.KIT_DEPLOY_KEY, "$" + "{{ secrets.KIT_DEPLOY_KEY }}");
	assert.equal(kitKey.env.CLOUDFLARE_API_TOKEN, undefined);
	for (const name of ["Prove one real queue delivery", "Remove the trial bus"]) {
		const step = bus.steps.find((candidate) => candidate.name === name);
		assert.equal(step.env.CLOUDFLARE_API_TOKEN, "$" + "{{ secrets.CLOUDFLARE_API_TOKEN }}");
		assert.equal(step.env.CLOUDFLARE_ACCOUNT_ID, "$" + "{{ vars.CLOUDFLARE_ACCOUNT_ID }}");
		assert.equal(step.env.CLOUDFLARE_WORKERS_API_TOKEN, undefined);
	}
	const summary = Object.values(workflow.jobs).find(
		(candidate) => candidate.name === "Required checks" && !candidate.strategy,
	);
	assert.equal(summary.needs.includes("machine-trial"), false);
	assert.equal(summary.needs.includes("bus-trial"), false);
	for (const event of ["workflow_dispatch", "push", "pull_request"]) {
		const context = expressionContext(event);
		const dispatch = event === "workflow_dispatch";
		const group = dispatch ? "trial-123456" : "ci-CI-refs/heads/04-machine-trial";
		assert.equal(evaluateExpression(workflow.concurrency.group, context), group);
		assert.equal(evaluateExpression(workflow.concurrency["cancel-in-progress"], context), !dispatch);
	}
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
