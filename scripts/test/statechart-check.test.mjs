import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

function check(t, { changed, eventName = "push", event = "before", originAtBefore = false }) {
	const dir = mkdtempSync(join(root, ".statechart-check-test-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const env = {
		...process.env,
		GIT_CONFIG_GLOBAL: "/dev/null",
		GIT_CONFIG_NOSYSTEM: "1",
		GITHUB_EVENT_NAME: eventName,
		GITHUB_EVENT_PATH: "",
	};
	const git = (...args) => execFileSync("git", args, { cwd: dir, env, encoding: "utf8" }).trim();
	mkdirSync(join(dir, "scripts"));
	mkdirSync(join(dir, "packages/statecharts/example"), { recursive: true });
	copyFileSync(join(root, "scripts/statechart-check.mjs"), join(dir, "scripts/statechart-check.mjs"));
	writeFileSync(join(dir, "packages/statecharts/example/Example.tla"), "\\* # model: policy.ts\n");
	writeFileSync(join(dir, "packages/statecharts/example/Example.cfg"), "");
	writeFileSync(join(dir, "packages/statecharts/example/view.mjs"), "");
	writeFileSync(join(dir, "packages/statecharts/example/chart.mmd"), "invalid chart\n");
	writeFileSync(join(dir, "policy.ts"), "export const value = 1;\n");
	git("init", "--quiet");
	git("config", "user.name", "Test");
	git("config", "user.email", "test@example.com");
	git("config", "commit.gpgsign", "false");
	git("config", "core.hooksPath", "/dev/null");
	git("add", ".");
	git("commit", "--quiet", "-m", "before");
	const before = git("rev-parse", "HEAD");
	writeFileSync(join(dir, changed), changed.endsWith(".tla") ? "\\* # model: policy.ts\n\\* changed\n" : "changed\n");
	git("add", ".");
	git("commit", "--quiet", "-m", "after");
	git("update-ref", "refs/remotes/origin/main", originAtBefore ? before : "HEAD");
	if (event !== "absent") {
		env.GITHUB_EVENT_PATH = join(dir, "event.json");
		if (event !== "missing") {
			writeFileSync(
				env.GITHUB_EVENT_PATH,
				event === "malformed" ? "{" : JSON.stringify({ before: event === "before" ? before : event }),
			);
		}
	}
	return spawnSync(process.execPath, ["scripts/statechart-check.mjs"], { cwd: dir, env, encoding: "utf8" });
}

for (const changed of ["packages/statecharts/example/Example.tla", "policy.ts"]) {
	test(`push checks ${changed} even when origin/main equals HEAD`, (t) => {
		const result = check(t, { changed });
		assert.equal(result.status, 1, result.stderr);
		assert.match(result.stderr, /not a stateDiagram-v2 chart/);
	});
}

test("push skips model checks for unrelated committed changes", (t) => {
	const result = check(t, { changed: "other.txt" });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /statechart:check skipped/);
});

for (const event of ["missing", "malformed", "f".repeat(40)]) {
	test(`push checks models when comparison cannot be read: ${event}`, (t) => {
		const result = check(t, { changed: "other.txt", event });
		assert.equal(result.status, 1, result.stderr);
		assert.match(result.stdout, /cannot read the comparison/);
		assert.match(result.stderr, /not a stateDiagram-v2 chart/);
	});
}

for (const options of [
	{ event: "0".repeat(40) },
	{ event: "invalid" },
	{ event: "absent" },
	{ eventName: "pull_request" },
]) {
	test(`origin/main comparison remains active for ${JSON.stringify(options)}`, (t) => {
		const result = check(t, { changed: "policy.ts", originAtBefore: true, ...options });
		assert.equal(result.status, 1, result.stderr);
		assert.match(result.stderr, /not a stateDiagram-v2 chart/);
	});
}
