import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { inspect } from "node:util";
import { checkView } from "../../.agents/skills/statechart/scripts/frontends/view.ts";
import { compile } from "../../.agents/skills/statechart/scripts/pipeline.ts";
import { check } from "../../.agents/skills/statechart/scripts/run.ts";
import * as view from "../../packages/statecharts/chat-dock/view.mjs";

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

const realRun = ["Type", "OpenDock", "OpenChat", "LeaveChat", "SendOn", "Type", "ClientTimeout"];

test("a real dock run stays open across Chat, types while Working, and times out the finish", async () => {
	configureTools();
	const result = await check(
		"packages/statecharts/chat-dock/ChatDock.tla",
		"packages/statecharts/chat-dock/ChatDock.cfg",
	);
	assert.equal(result.exit, 0);
	assert.ok(result.rules.every((rule) => rule.outcome === "holds"));
	const { states, steps } = result.graph;
	const varsOf = (id) => states.get(id).vars;
	const returned = steps.find(
		(step) => step.action === "LeaveChat" && varsOf(step.from).dock === "hidden" && varsOf(step.to).dock === "open",
	);
	assert.ok(returned, "LeaveChat does not open the dock again");
	const typedWhileWorking = steps.find(
		(step) => step.action === "Type" && varsOf(step.from).phase === "working" && varsOf(step.to).pageDraft === "text",
	);
	assert.ok(typedWhileWorking, "Type while Working is missing");
	const clientTimeout = steps.find((step) => step.action === "ClientTimeout");
	assert.ok(clientTimeout, "ClientTimeout is missing");
	let current = [...states].find(([, state]) => state.start)[0];
	const reached = [];
	for (const action of realRun) {
		const edge = steps.find((step) => step.from === current && step.action === action);
		assert.ok(edge, `Missing reachable transition: ${action}`);
		current = edge.to;
		reached.push({ action, vars: varsOf(current) });
	}
	const hidden = reached[3].vars;
	assert.equal(hidden.page, "workspace");
	assert.equal(hidden.dock, "open");
	const typed = reached[5].vars;
	assert.equal(typed.phase, "working");
	assert.equal(typed.pageDraft, "text");
	assert.equal(typed.dockDraft, "text");
	const timedOut = reached[6].vars;
	assert.equal(timedOut.phase, "idle");
	assert.equal(timedOut.sent, "no");
	assert.equal(timedOut.abandoned, false);
	assert.equal(timedOut.abandonedTask, true);
	assert.equal(timedOut.pageDraft, "text");
	assert.equal(timedOut.resultEv, 0);
	const { files } = compile(result, checkView(view, inspect));
	assert.ok([...files].some(([name]) => name === "chart.mmd"));
});
