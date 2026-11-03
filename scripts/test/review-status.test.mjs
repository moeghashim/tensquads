import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { DIAGRAMS, summary } from "../../apps/landing/review-src/diagrams.mjs";
import { BUILT, PLANNED, PROGRESS, readStatus } from "../../apps/landing/review-src/status.mjs";

function repository(t) {
	const cwd = mkdtempSync(join(process.cwd(), ".review-status-test-"));
	t.after(() => rmSync(cwd, { recursive: true, force: true }));
	const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
	git("init", "--initial-branch=main");
	git("config", "user.name", "Review Test");
	git("config", "user.email", "review@example.test");
	git("config", "commit.gpgsign", "false");
	git("commit", "--allow-empty", "-m", "Initial");
	const merge = (task, subject = `Merge pull request #1 from moeghashim/${task}`) => {
		git("checkout", "-b", task);
		git("commit", "--allow-empty", "-m", task);
		git("update-ref", `refs/remotes/origin/${task}`, "HEAD");
		git("checkout", "main");
		git("merge", "--no-ff", task, "-m", subject);
	};
	return { git, merge };
}

test("merged history survives deleted and advanced origin branches", (t) => {
	const { git, merge } = repository(t);
	const before = git("rev-parse", "HEAD").trim();
	merge("00-foundation", "Merge phase 0 foundation (#1)");
	merge("02-agents");
	git("update-ref", "-d", "refs/remotes/origin/02-agents");
	merge("02-chat");
	merge("02-traffic");
	git("checkout", "02-chat");
	git("commit", "--allow-empty", "-m", "More chat work");
	git("update-ref", "refs/remotes/origin/02-chat", "HEAD");
	git("update-ref", "refs/remotes/origin/02-overview", "HEAD");
	git("checkout", "main");
	const st = readStatus(git, "main");
	for (const task of ["00-foundation", "02-agents", "02-chat", "02-traffic"]) assert.equal(st.one(task), BUILT);
	assert.equal(st.one("02-overview"), PROGRESS);
	assert.equal(st.one("03-super-admin"), PLANNED);
	assert.equal(st.of([]), PLANNED);
	assert.equal(st.of(["02-chat", "02-traffic"]), BUILT);
	assert.equal(st.of(["02-agents", "02-agent-detail"]), PROGRESS);
	assert.equal(st.of(["03-super-admin", "05-proof-of-concept"]), PLANNED);
	assert.equal(readStatus(git, before).one("02-traffic"), PROGRESS);
	const layers = DIAGRAMS["system layers"](st);
	assert.match(layers, /class="sc built"><i><\/i>4 Chat/);
	assert.match(layers, /3 of 10 built/);
	assert.match(DIAGRAMS["build phases"](st), /3 of 7 tasks merged/);
	assert.match(summary(st, "abc", "2026-11-03"), /<strong>4 of 12<\/strong>/);
});

test("core boxes follow their functional tasks while interfaces follow foundation", (t) => {
	const { git, merge } = repository(t);
	merge("00-foundation", "Merge phase 0 foundation (#1)");
	const mappings = [
		["Platform", ["00-foundation", "03-super-admin"]],
		["Squads and Agents", ["02-agents", "02-agent-detail"]],
		["Bus and Shared State", ["02-traffic"]],
		["Policy", ["02-overview", "02-rules"]],
		["Catalog", ["03-super-admin"]],
		["Conversation", ["02-frame", "02-chat"]],
	];
	const merged = new Set(["00-foundation"]);
	const check = () => {
		const html = DIAGRAMS["system layers"](readStatus(git, "main"));
		for (const [title, tasks] of mappings) {
			const count = tasks.filter((task) => merged.has(task)).length;
			const state = count === tasks.length ? BUILT : count ? PROGRESS : PLANNED;
			assert.ok(html.includes(`<div class="bx ${state}"><b>${title}</b>`), `${title}: ${state}`);
		}
		for (const title of [
			"MachineProvider",
			"EventBus",
			"IntegrationGateway",
			"Repositories",
			"Test machines",
			"In-memory bus",
			"Placeholders",
			"Neon Postgres",
		]) {
			assert.ok(html.includes(`<div class="bx built"><b>${title}</b>`), title);
		}
	};
	check();
	for (const task of new Set(mappings.flatMap(([, tasks]) => tasks))) {
		if (merged.has(task)) continue;
		merge(task);
		merged.add(task);
		check();
	}
});
