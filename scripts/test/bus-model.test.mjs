import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspect } from "node:util";
import { check } from "../../.agents/skills/statechart/scripts/run.ts";

const specPath = "packages/statecharts/bus/Bus.tla";
const configPath = "packages/statecharts/bus/Bus.cfg";

function configureTools() {
	const env = { ...process.env, MISE_TRUSTED_CONFIG_PATHS: process.cwd() };
	const tool =
		"http:tla2tools[url=https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar,checksum=sha256:936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88]@1.7.4";
	process.env.TLA2TOOLS ??= join(
		execFileSync("mise", ["where", tool], { env, encoding: "utf8" }).trim(),
		"tla2tools.jar",
	);
	process.env.JAVA ??= execFileSync("mise", ["which", "java", "--tool", "java@temurin-25"], {
		env,
		encoding: "utf8",
	}).trim();
}

function rule(result, name) {
	const found = [...result.rules, ...result.properties].find((item) => item.rule.name === name);
	assert.ok(found, `${name} is missing`);
	return found;
}

function walk(steps, start, actions) {
	let current = start;
	for (const action of actions) {
		const edge = steps.find((step) => step.from === current && step.action === action);
		assert.ok(edge, `Missing reachable transition: ${action}`);
		current = edge.to;
	}
	return current;
}

test("a queued click drains after a live commit", async () => {
	configureTools();
	const result = await check(specPath, configPath);
	assert.equal(result.exit, 0);
	assert.ok(result.rules.every((item) => item.outcome === "holds"));
	assert.equal(
		rule(result, "AllClicksDrain").outcome,
		"holds",
		inspect(rule(result, "AllClicksDrain").bug, { depth: 4 }),
	);
	assert.equal(rule(result, "QueuedClickRuns").outcome, "holds");
	const { states, steps } = result.graph;
	const start = [...states].find(([, state]) => state.start)[0];
	const drained = walk(steps, start, ["Resume", "LiveStart", "SendWhileWaiting", "LiveCommit", "QueuedDrain"]);
	const vars = states.get(drained).vars;
	assert.equal(vars.manual, 0);
	assert.equal(vars.count, 1);
	assert.equal(vars.delivery, "acknowledged");
	assert.equal(vars.guard, "idle");
});

test("blocking the drain leaves the queued click stuck", async () => {
	configureTools();
	const spec = readFileSync(specPath, "utf8");
	const mutant = spec.replace("\n    \\/ QueuedDrain", "").replace(" /\\ WF_vars(QueuedDrain)", "");
	assert.notEqual(mutant, spec);
	assert.equal(mutant.includes("\\/ QueuedDrain"), false);
	assert.equal(mutant.includes("WF_vars(QueuedDrain)"), false);
	const dir = mkdtempSync(join(tmpdir(), "bus-drain-mutant-"));
	try {
		writeFileSync(join(dir, "Bus.tla"), mutant);
		writeFileSync(join(dir, "Bus.cfg"), readFileSync(configPath));
		const result = await check(join(dir, "Bus.tla"), join(dir, "Bus.cfg"));
		const drain = rule(result, "AllClicksDrain");
		assert.equal(drain.outcome, "broken", inspect(drain, { depth: 4 }));
		assert.equal(rule(result, "WritesMatch").outcome, "holds");
		assert.equal(rule(result, "AppendsWithWrites").outcome, "holds");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
