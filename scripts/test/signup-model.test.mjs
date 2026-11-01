import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { inspect } from "node:util";
import { checkView } from "../../.agents/skills/statechart/scripts/frontends/view.ts";
import { compile } from "../../.agents/skills/statechart/scripts/pipeline.ts";
import { check } from "../../.agents/skills/statechart/scripts/run.ts";
import * as view from "../../packages/statecharts/signup/view.mjs";

test("TLC separates submission, creation, navigation failure, and an idempotent retry", async () => {
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
	const result = await check("packages/statecharts/signup/Signup.tla", "packages/statecharts/signup/Signup.cfg");
	assert.equal(result.exit, 0);
	assert.equal(result.states.distinct, 41);
	assert.ok(result.rules.every((rule) => rule.outcome === "holds"));
	const { states, steps } = result.graph;
	assert.equal(steps.length, 84);
	for (const edge of steps) {
		const from = states.get(edge.from).vars;
		const to = states.get(edge.to).vars;
		if (edge.action === "Submit") {
			assert.equal(to.phase, "request");
			assert.equal(to.step, "account");
			assert.equal(to.accounts, from.accounts);
		}
		if (edge.action === "Create" || edge.action === "FindExisting") assert.equal(to.accounts, 1);
		if (edge.action === "FailNavigation") {
			assert.equal(to.accounts, 1);
			assert.equal(to.step, "account");
		}
	}
	let current = [...states].find(([, state]) => state.start)[0];
	for (const action of [
		"PickNew",
		"ChooseSquads",
		"OpenAccount",
		"Submit",
		"FailResponse",
		"Submit",
		"Create",
		"FailNavigation",
		"Submit",
		"FindExisting",
		"Navigate",
	]) {
		const edge = steps.find((step) => step.from === current && step.action === action);
		assert.ok(edge, `Missing reachable transition: ${action}`);
		current = edge.to;
	}
	assert.equal(states.get(current).vars.accounts, 1);
	assert.equal(states.get(current).vars.step, "created");
	const { files } = compile(result, checkView(view, inspect));
	const chart = [...files].find(([name]) => name === "chart.mmd")[1];
	assert.equal(`${[...chart].join("")}\n`, readFileSync("packages/statecharts/signup/chart.mmd", "utf8"));
});
