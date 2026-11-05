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

test("an ancestor that holds the lock does not wait or remove it", { timeout: 10000 }, async (t) => {
	const { lock } = await fixture(t);
	const parent = spawn(
		process.execPath,
		[
			"-e",
			`
			const { spawnSync } = require("node:child_process");
			const { mkdirSync, writeFileSync } = require("node:fs");
			mkdirSync(process.env.LOCK);
			writeFileSync(process.env.LOCK + "/pid", String(process.pid));
			const result = spawnSync("sh", [process.env.SCRIPT, process.execPath, "-e", "process.exit(0)"], {
				env: process.env,
				timeout: 3000,
			});
			process.exit(result.status === 0 ? 0 : 1);
		`,
		],
		{
			env: { ...process.env, LOCK: lock, SCRIPT: script, TS_E2E_LOCK_DIR: lock },
			stdio: ["ignore", "inherit", "inherit"],
		},
	);
	assert.deepEqual(await once(parent, "exit"), [0, null]);
	assert.equal(await readFile(path.join(lock, "pid"), "utf8"), `${parent.pid}`);
});
