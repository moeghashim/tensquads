import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const script = path.resolve("scripts/with-verify-lock.sh");

async function fixture(t) {
	const root = await mkdtemp(path.resolve("scripts/test/.verify-lock-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	return { lock: path.join(root, "ts-e2e.lock"), log: path.join(root, "log") };
}

function run(t, lock, code, args = [], extraEnv = {}) {
	const child = spawn("sh", [script, process.execPath, "-e", code, ...args], {
		env: { ...process.env, TS_E2E_LOCK_DIR: lock, ...extraEnv },
		stdio: ["ignore", "pipe", "inherit"],
		detached: true,
	});
	const exited = once(child, "exit");
	t.after(async () => {
		if (child.exitCode === null && child.signalCode === null) {
			try {
				process.kill(-child.pid, "SIGKILL");
			} catch {
				child.kill("SIGKILL");
			}
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

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pausePids(pause, point) {
	const names = await readdir(pause).catch(() => []);
	const prefix = `${point}.`;
	const suffix = ".ready";
	return names
		.filter((name) => name.startsWith(prefix) && name.endsWith(suffix))
		.map((name) => name.slice(prefix.length, -suffix.length));
}

async function waitFor(label, predicate, timeoutMs = 15000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (await predicate()) return;
		await sleep(20);
	}
	throw new Error(`timed out waiting for ${label}`);
}

// The holder pauses after mkdir. A second reclaimer, which already read the
// dead pid, then moves that directory. The command must not start until the
// pid file names this process.
test("a reclaimer that moves a fresh directory before the pid write does not share the lock", {
	timeout: 40000,
}, async (t) => {
	const { lock, log } = await fixture(t);
	const root = path.dirname(lock);
	const pause = path.join(root, "pause");
	const release = path.join(root, "release");
	const token = path.join(root, "in-section");
	await mkdir(pause);
	for (const point of ["saw-dead", "after-mkdir", "after-steal"]) {
		await writeFile(path.join(pause, `${point}.on`), "");
	}
	await mkdir(lock);
	const dead = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
	await once(dead, "exit");
	await writeFile(path.join(lock, "pid"), `${dead.pid}\n`);
	const code = `
		const { appendFileSync, existsSync, mkdirSync, rmSync } = require("node:fs");
		const log = process.argv[1];
		const release = process.argv[2];
		const token = process.argv[3];
		try {
			mkdirSync(token);
		} catch (error) {
			appendFileSync(log, "OVERLAP\\n");
			process.exit(2);
		}
		appendFileSync(log, "S\\n");
		const start = Date.now();
		while (!existsSync(release)) {
			if (Date.now() - start > 25000) process.exit(3);
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
		}
		rmSync(token, { recursive: true, force: true });
		appendFileSync(log, "E\\n");
	`;
	const env = { TS_E2E_LOCK_PAUSE_DIR: pause };
	const args = [log, release, token];
	const first = run(t, lock, code, args, env);
	const second = run(t, lock, code, args, env);
	t.after(async () => {
		await writeFile(release, "").catch(() => {});
	});

	await waitFor("two readers of the dead pid", async () => (await pausePids(pause, "saw-dead")).length >= 2);
	const [pidA, pidB] = await pausePids(pause, "saw-dead");
	await writeFile(path.join(pause, `saw-dead.${pidA}.go`), "");
	await waitFor(
		"mkdir before the pid write",
		async () => (await pausePids(pause, "after-mkdir")).includes(pidA),
		20000,
	);
	await writeFile(path.join(pause, `saw-dead.${pidB}.go`), "");
	await rm(path.join(pause, "saw-dead.on"), { force: true });

	let stole = false;
	await waitFor("reclaim of the fresh directory", async () => {
		if ((await pausePids(pause, "after-steal")).includes(pidB)) {
			stole = true;
			return true;
		}
		const trace = await readFile(path.join(pause, "trace"), "utf8").catch(() => "");
		return trace.includes(`reclaim-done ${pidB}`);
	});
	await writeFile(path.join(pause, `after-mkdir.${pidA}.go`), "");
	// Later acquires must not stop at this gate.
	await rm(path.join(pause, "after-mkdir.on"), { force: true });
	let third = null;
	if (stole) {
		// The directory is still moved. A third run can take it while the first
		// command starts, which is the overlap the pid check must reject.
		third = run(t, lock, code, args);
		await waitFor("overlap or a second start", async () => {
			const text = await readFile(log, "utf8").catch(() => "");
			return text.includes("OVERLAP") || text.split("S\n").length > 2;
		});
		await writeFile(path.join(pause, `after-steal.${pidB}.go`), "").catch(() => {});
		await rm(path.join(pause, "after-steal.on"), { force: true });
	}
	await waitFor("first critical section", async () => {
		const text = await readFile(log, "utf8").catch(() => "");
		return text.includes("S\n");
	});
	await writeFile(release, "");
	const firstExit = await first.exited;
	const secondExit = await second.exited;
	if (third) await third.exited;
	const text = await readFile(log, "utf8");
	assert.equal(text, "S\nE\nS\nE\n");
	assert.deepEqual(firstExit, [0, null]);
	assert.deepEqual(secondExit, [0, null]);
});

const holdSection = `
	const { appendFileSync, existsSync, mkdirSync, rmSync } = require("node:fs");
	const log = process.argv[1];
	const release = process.argv[2];
	const token = process.argv[3];
	try {
		mkdirSync(token);
	} catch (error) {
		appendFileSync(log, "OVERLAP\\n");
		process.exit(2);
	}
	appendFileSync(log, "S\\n");
	const start = Date.now();
	while (!existsSync(release)) {
		if (Date.now() - start > 25000) process.exit(3);
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
	}
	rmSync(token, { recursive: true, force: true });
	appendFileSync(log, "E\\n");
`;

test("the command does not run when the directory disappears before the pid write", {
	timeout: 20000,
}, async (t) => {
	const { lock, log } = await fixture(t);
	const root = path.dirname(lock);
	const pause = path.join(root, "pause");
	const release = path.join(root, "release");
	const token = path.join(root, "in-section");
	await mkdir(pause);
	await writeFile(path.join(pause, "after-mkdir.on"), "");
	t.after(async () => {
		await writeFile(release, "").catch(() => {});
	});
	const args = [log, release, token];
	const holder = run(t, lock, holdSection, args, { TS_E2E_LOCK_PAUSE_DIR: pause });
	await waitFor("pause after mkdir", async () => (await pausePids(pause, "after-mkdir")).length === 1);
	const [pid] = await pausePids(pause, "after-mkdir");
	// A reclaimer that already chose the stale pid moves the new directory away.
	await rename(lock, `${lock}.stolen`);
	const peer = run(t, lock, holdSection, args);
	await waitFor("peer holds the lock", async () => {
		const text = await readFile(log, "utf8").catch(() => "");
		return text.includes("S\n");
	});
	await writeFile(path.join(pause, `after-mkdir.${pid}.go`), "");
	await rm(path.join(pause, "after-mkdir.on"), { force: true });
	let lost = false;
	await waitFor("holder backs off or both enter", async () => {
		const text = await readFile(log, "utf8").catch(() => "");
		if (text.includes("OVERLAP")) return true;
		const trace = await readFile(path.join(pause, "trace"), "utf8").catch(() => "");
		if (trace.split("\n").includes(`lost-pid ${pid}`)) {
			lost = true;
			return true;
		}
		return false;
	});
	await writeFile(release, "");
	const holderExit = await holder.exited;
	const peerExit = await peer.exited;
	const text = await readFile(log, "utf8");
	assert.equal(text, "S\nE\nS\nE\n");
	assert.equal(lost, true);
	assert.deepEqual(holderExit, [0, null]);
	assert.deepEqual(peerExit, [0, null]);
});
