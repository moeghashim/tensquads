import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const script = path.resolve("scripts/with-verify-lock.sh");

async function fixture(t) {
	const root = await mkdtemp(path.resolve("scripts/test/.verify-lock-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	return { lock: path.join(root, "ts-e2e.lock"), log: path.join(root, "log") };
}

function run(t, lock, code, args = []) {
	const child = spawn("sh", [script, process.execPath, "-e", code, ...args], {
		env: { ...process.env, TS_E2E_LOCK_DIR: lock },
		stdio: ["ignore", "pipe", "inherit"],
	});
	const exited = once(child, "exit");
	t.after(async () => {
		if (child.exitCode === null && child.signalCode === null) {
			child.kill("SIGKILL");
			await exited;
		}
	});
	return { child, exited };
}

test("two commands on one lock directory do not overlap", { timeout: 20000 }, async (t) => {
	const { lock, log } = await fixture(t);
	const first = run(
		t,
		lock,
		`
		const { appendFileSync } = require("node:fs");
		const log = process.argv[1];
		appendFileSync(log, "A\\n");
		process.stdout.write("ready");
		setTimeout(() => appendFileSync(log, "B\\n"), 1000);
	`,
		[log],
	);
	await once(first.child.stdout, "data");
	const second = run(t, lock, 'require("node:fs").appendFileSync(process.argv[1], "C\\n")', [log]);
	assert.deepEqual(await first.exited, [0, null]);
	assert.deepEqual(await second.exited, [0, null]);
	assert.equal(await readFile(log, "utf8"), "A\nB\nC\n");
});

test("a live pid in the lock directory makes the script wait", { timeout: 20000 }, async (t) => {
	const { lock, log } = await fixture(t);
	await mkdir(lock);
	const holder = spawn(process.execPath, ["-e", "process.stdout.write('up'); setInterval(() => {}, 1000)"], {
		stdio: ["ignore", "pipe", "inherit"],
	});
	const holderExited = once(holder, "exit");
	t.after(() => {
		if (holder.exitCode === null && holder.signalCode === null) holder.kill("SIGKILL");
	});
	await once(holder.stdout, "data");
	await writeFile(path.join(lock, "pid"), `${holder.pid}\n`);
	const waiter = run(t, lock, 'require("node:fs").writeFileSync(process.argv[1], "got\\n")', [log]);
	await new Promise((resolve) => setTimeout(resolve, 1000));
	assert.equal(waiter.child.exitCode, null);
	await assert.rejects(access(log));
	assert.equal(await readFile(path.join(lock, "pid"), "utf8"), `${holder.pid}\n`);
	holder.kill("SIGKILL");
	await holderExited;
	assert.deepEqual(await waiter.exited, [0, null]);
	assert.equal(await readFile(log, "utf8"), "got\n");
});

test("a lock-script ancestor does not wait or remove the lock", { timeout: 10000 }, async (t) => {
	const { lock, log } = await fixture(t);
	// The outer wrapper is the holder. Its command line names the lock script.
	const outer = run(
		t,
		lock,
		`
		const { spawnSync } = require("node:child_process");
		const result = spawnSync("sh", [process.argv[2], process.execPath, "-e", "process.exit(0)"], {
			env: process.env,
			timeout: 3000,
		});
		process.exit(result.status === 0 ? 0 : 1);
	`,
		[log, script],
	);
	assert.deepEqual(await outer.exited, [0, null]);
	assert.equal(await readFile(path.join(lock, "pid"), "utf8").catch(() => ""), "");
});

test("an unrelated ancestor named in the pid file does not bypass the lock", { timeout: 20000 }, async (t) => {
	const { lock, log } = await fixture(t);
	const parent = spawn(
		process.execPath,
		[
			"-e",
			`
			const { spawn } = require("node:child_process");
			const { mkdirSync, writeFileSync, rmSync } = require("node:fs");
			mkdirSync(process.env.LOCK);
			writeFileSync(process.env.LOCK + "/pid", String(process.pid));
			const inner = spawn("sh", [process.env.SCRIPT, process.execPath, "-e",
				'require("node:fs").writeFileSync(process.argv[1], "got\\\\n")', process.env.LOG], {
				env: process.env, stdio: "inherit",
			});
			globalThis.inner = inner;
			setTimeout(() => rmSync(process.env.LOCK, { recursive: true, force: true }), 1500);
			inner.on("exit", (code) => process.exit(code === 0 ? 0 : 1));
		`,
		],
		{
			env: { ...process.env, LOCK: lock, LOG: log, SCRIPT: script, TS_E2E_LOCK_DIR: lock },
			stdio: ["ignore", "inherit", "inherit"],
		},
	);
	const parentExited = once(parent, "exit");
	await new Promise((resolve) => setTimeout(resolve, 1000));
	// The inner command must still be waiting: it has not written the log.
	await assert.rejects(access(log));
	assert.deepEqual(await parentExited, [0, null]);
	assert.equal(await readFile(log, "utf8"), "got\n");
});

test("a lock replaced with another live pid survives our exit", { timeout: 10000 }, async (t) => {
	const { lock } = await fixture(t);
	const other = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
	t.after(() => {
		if (other.exitCode === null && other.signalCode === null) other.kill("SIGKILL");
	});
	const { exited } = run(
		t,
		lock,
		'require("node:fs").writeFileSync(process.env.TS_E2E_LOCK_DIR + "/pid", process.argv[1] + "\\n")',
		[String(other.pid)],
	);
	assert.deepEqual(await exited, [0, null]);
	assert.equal(await readFile(path.join(lock, "pid"), "utf8"), `${other.pid}\n`);
});

test("two concurrent reclaimers of a stale lock end with exactly one holder at a time", {
	timeout: 30000,
}, async (t) => {
	const { lock, log } = await fixture(t);
	await mkdir(lock);
	// A dead pid makes the lock stale.
	const dead = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
	await once(dead, "exit");
	await writeFile(path.join(lock, "pid"), `${dead.pid}\n`);
	const code = `
		const { appendFileSync } = require("node:fs");
		const log = process.argv[1];
		appendFileSync(log, "S\\n");
		setTimeout(() => appendFileSync(log, "E\\n"), 800);
	`;
	const first = run(t, lock, code, [log]);
	const second = run(t, lock, code, [log]);
	assert.deepEqual(await first.exited, [0, null]);
	assert.deepEqual(await second.exited, [0, null]);
	assert.equal(await readFile(log, "utf8"), "S\nE\nS\nE\n");
});
