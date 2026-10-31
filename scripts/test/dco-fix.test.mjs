import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const { scripts } = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));

test("dco:fix signs existing commits on an up-to-date branch without changing files", () => {
	const directory = mkdtempSync(new URL(".dco-test-", root));
	const env = {
		...process.env,
		HUSKY: "0",
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: join(directory, "no-global-config"),
	};
	const git = (...args) =>
		execFileSync("git", args, { cwd: directory, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
	try {
		git("init");
		git("config", "user.name", "Moe Ghashim");
		git("config", "user.email", "mohanadgh@gmail.com");
		git("-c", "commit.gpgSign=false", "commit", "--allow-empty", "--signoff", "-m", "Base");
		const base = git("rev-parse", "HEAD");
		git("-c", "commit.gpgSign=false", "commit", "--allow-empty", "-m", "Automated fix one");
		git("-c", "commit.gpgSign=false", "commit", "--allow-empty", "-m", "Automated fix two");
		const tree = git("rev-parse", "HEAD^{tree}");
		const subjects = git("log", "--format=%s", `${base}..HEAD`);
		const [command, ...args] = scripts["dco:fix"].split(" ");
		execFileSync(command, [...args, base], { cwd: directory, env, stdio: "pipe" });
		const messages = git("log", "--format=%B%x00", `${base}..HEAD`)
			.split("\0")
			.filter((text) => text.trim());
		assert.equal(messages.length, 2);
		for (const message of messages) {
			assert.match(message, /^Signed-off-by: Moe Ghashim <mohanadgh@gmail\.com>$/m);
		}
		assert.equal(git("rev-parse", "HEAD^{tree}"), tree);
		assert.equal(git("log", "--format=%s", `${base}..HEAD`), subjects);
		assert.equal(git("status", "--porcelain"), "");
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
