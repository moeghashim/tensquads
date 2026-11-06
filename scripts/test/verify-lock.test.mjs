import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, mkdtemp, readdir, readFile, rename, rm, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const script = path.resolve(process.env.TS_E2E_LOCK_SCRIPT ?? "scripts/with-verify-lock.sh");
const shell = process.env.TS_E2E_LOCK_SHELL ?? "sh";

async function fixture(t) {
	const root = await mkdtemp(path.resolve("scripts/test/.verify-lock-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	return { lock: path.join(root, "ts-e2e.lock"), log: path.join(root, "log") };
}

function run(t, lock, code, args = [], extraEnv = {}) {
	const child = spawn(shell, [script, process.execPath, "-e", code, ...args], {
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
		const result = spawnSync(process.env.TS_E2E_LOCK_SHELL || "sh", [process.argv[2], process.execPath, "-e", "process.exit(0)"], {
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
			const inner = spawn(process.env.TS_E2E_LOCK_SHELL || "sh", [process.env.SCRIPT, process.execPath, "-e",
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

async function releasePauses(pause) {
	const names = await readdir(pause).catch(() => []);
	await Promise.all(
		names
			.filter((name) => name.endsWith(".ready"))
			.map((name) => writeFile(path.join(pause, name.replace(/\.ready$/, ".go")), "").catch(() => {})),
	);
}

// B has passed the age checks and waits before mv. A then takes a fresh lock
// and runs. B must not move that lock. C must not run with A.
test("an aged-directory reclaimer that pauses before mv does not displace a fresh holder", {
	timeout: 40000,
}, async (t) => {
	const { lock, log } = await fixture(t);
	const root = path.dirname(lock);
	const pause = path.join(root, "pause");
	const release = path.join(root, "release");
	const token = path.join(root, "in-section");
	await mkdir(pause);
	await writeFile(path.join(pause, "before-aged-mv.on"), "");
	// The old script pauses here after it has moved the live directory.
	await writeFile(path.join(pause, "after-steal.on"), "");
	await mkdir(lock);
	const past = new Date(Date.now() - 125 * 60 * 1000);
	await utimes(lock, past, past);
	t.after(async () => {
		await writeFile(release, "").catch(() => {});
		await releasePauses(pause);
	});

	const env = { TS_E2E_LOCK_PAUSE_DIR: pause };
	const args = [log, release, token];
	const first = run(t, lock, holdSection, args, env);
	const second = run(t, lock, holdSection, args, env);

	await waitFor(
		"two reclaimers at before-aged-mv",
		async () => (await pausePids(pause, "before-aged-mv")).length >= 2,
	);
	const [pidA, pidB] = await pausePids(pause, "before-aged-mv");
	await rm(path.join(pause, "before-aged-mv.on"), { force: true });
	await writeFile(path.join(pause, `before-aged-mv.${pidA}.go`), "");

	await waitFor(
		"first holder starts its command",
		async () => {
			const text = await readFile(log, "utf8").catch(() => "");
			return text.includes("S\n");
		},
		20000,
	);
	const holderPid = (await readFile(path.join(lock, "pid"), "utf8")).trim();

	await writeFile(path.join(pause, `before-aged-mv.${pidB}.go`), "");
	let stole = false;
	await waitFor("second reclaimer steals or leaves the holder", async () => {
		if ((await pausePids(pause, "after-steal")).includes(pidB)) {
			stole = true;
			return true;
		}
		const trace = await readFile(path.join(pause, "trace"), "utf8").catch(() => "");
		const pid = await readFile(path.join(lock, "pid"), "utf8").catch(() => "");
		return trace.includes(`reclaim-done ${pidB}`) && pid.trim() === holderPid;
	});

	const third = run(t, lock, holdSection, args);
	if (stole) {
		await waitFor("overlap after the live directory moved", async () => {
			const text = await readFile(log, "utf8").catch(() => "");
			return text.includes("OVERLAP") || text.split("S\n").length > 2;
		});
		await writeFile(path.join(pause, `after-steal.${pidB}.go`), "").catch(() => {});
		await rm(path.join(pause, "after-steal.on"), { force: true });
	} else {
		await sleep(1000);
	}
	await writeFile(release, "");

	const firstExit = await first.exited;
	const secondExit = await second.exited;
	const thirdExit = await third.exited;
	const text = await readFile(log, "utf8");
	assert.equal(stole, false);
	assert.equal(text, "S\nE\nS\nE\nS\nE\n");
	assert.deepEqual(firstExit, [0, null]);
	assert.deepEqual(secondExit, [0, null]);
	assert.deepEqual(thirdExit, [0, null]);
});

test("an aged empty or non-numeric pid file is reclaimed after 120 minutes", {
	timeout: 20000,
}, async (t) => {
	const past = new Date(Date.now() - 125 * 60 * 1000);
	for (const content of ["", "not-a-pid\n"]) {
		const { lock, log } = await fixture(t);
		await mkdir(lock);
		const pidFile = path.join(lock, "pid");
		await writeFile(pidFile, content);
		// The file is old. The directory is young. The file age must win.
		await utimes(pidFile, past, past);
		await utimes(lock, new Date(), new Date());
		const { exited } = run(t, lock, 'require("node:fs").writeFileSync(process.argv[1], "reclaimed\\n")', [log]);
		assert.deepEqual(await exited, [0, null]);
		assert.equal(await readFile(log, "utf8"), "reclaimed\n");
	}
});

test("a fresh empty or non-numeric pid file is not reclaimed before 120 minutes", {
	timeout: 20000,
}, async (t) => {
	for (const content of ["", "not-a-pid\n"]) {
		const { lock, log } = await fixture(t);
		await mkdir(lock);
		const pidFile = path.join(lock, "pid");
		await writeFile(pidFile, content);
		// The directory is old. The file is young. The file age must win.
		const past = new Date(Date.now() - 125 * 60 * 1000);
		await utimes(lock, past, past);
		await utimes(pidFile, new Date(), new Date());
		const waiter = run(t, lock, 'require("node:fs").writeFileSync(process.argv[1], "got\\n")', [log]);
		await sleep(1000);
		assert.equal(waiter.child.exitCode, null);
		await assert.rejects(access(log));
		await rm(lock, { recursive: true, force: true });
		assert.deepEqual(await waiter.exited, [0, null]);
		assert.equal(await readFile(log, "utf8"), "got\n");
	}
});

// The renamed copy is still the aged directory. A test then makes it young.
// The second check must put it back. A missing age check deletes it.
test("an aged reclaimer puts back a renamed directory that is younger than 120 minutes", {
	timeout: 20000,
}, async (t) => {
	const { lock } = await fixture(t);
	const root = path.dirname(lock);
	const pause = path.join(root, "pause");
	await mkdir(pause);
	await writeFile(path.join(pause, "before-aged-mv.on"), "");
	await writeFile(path.join(pause, "before-aged-judge.on"), "");
	await mkdir(lock);
	await writeFile(path.join(lock, "marker"), "keep\n");
	const past = new Date(Date.now() - 125 * 60 * 1000);
	await utimes(lock, past, past);
	t.after(() => releasePauses(pause));
	const holder = run(t, lock, "process.exit(0)", [], { TS_E2E_LOCK_PAUSE_DIR: pause });
	await waitFor("pause before aged mv", async () => (await pausePids(pause, "before-aged-mv")).length === 1);
	const [pid] = await pausePids(pause, "before-aged-mv");
	await rm(path.join(pause, "before-aged-mv.on"), { force: true });
	await writeFile(path.join(pause, `before-aged-mv.${pid}.go`), "");
	await waitFor("pause before the second check", async () =>
		(await pausePids(pause, "before-aged-judge")).includes(pid),
	);
	const moved = `${lock}.stale.${pid}`;
	await utimes(moved, new Date(), new Date());
	await rm(path.join(pause, "before-aged-judge.on"), { force: true });
	await writeFile(path.join(pause, `before-aged-judge.${pid}.go`), "");
	await sleep(300);
	assert.equal(await readFile(path.join(lock, "marker"), "utf8"), "keep\n");
	holder.child.kill("SIGKILL");
});

// The renamed copy is old, then a live pid is written into it and left old.
// The pid read must put it back. An age-only check would delete it.
test("an aged reclaimer puts back a renamed directory that gained a live pid", {
	timeout: 20000,
}, async (t) => {
	const { lock } = await fixture(t);
	const root = path.dirname(lock);
	const pause = path.join(root, "pause");
	await mkdir(pause);
	await writeFile(path.join(pause, "before-aged-mv.on"), "");
	await writeFile(path.join(pause, "before-aged-judge.on"), "");
	await mkdir(lock);
	const past = new Date(Date.now() - 125 * 60 * 1000);
	await utimes(lock, past, past);
	const sleeper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
	t.after(() => {
		if (sleeper.exitCode === null && sleeper.signalCode === null) sleeper.kill("SIGKILL");
	});
	t.after(() => releasePauses(pause));
	const holder = run(t, lock, "process.exit(0)", [], { TS_E2E_LOCK_PAUSE_DIR: pause });
	await waitFor("pause before aged mv", async () => (await pausePids(pause, "before-aged-mv")).length === 1);
	const [pid] = await pausePids(pause, "before-aged-mv");
	await rm(path.join(pause, "before-aged-mv.on"), { force: true });
	await writeFile(path.join(pause, `before-aged-mv.${pid}.go`), "");
	await waitFor("pause before the second check", async () =>
		(await pausePids(pause, "before-aged-judge")).includes(pid),
	);
	const moved = `${lock}.stale.${pid}`;
	const movedPid = path.join(moved, "pid");
	await writeFile(movedPid, `${sleeper.pid}\n`);
	await utimes(movedPid, past, past);
	await utimes(moved, past, past);
	await rm(path.join(pause, "before-aged-judge.on"), { force: true });
	await writeFile(path.join(pause, `before-aged-judge.${pid}.go`), "");
	await sleep(300);
	assert.equal((await readFile(path.join(lock, "pid"), "utf8")).trim(), String(sleeper.pid));
	holder.child.kill("SIGKILL");
});

test("the command does not run when the pid file changes after the write", {
	timeout: 20000,
}, async (t) => {
	const { lock, log } = await fixture(t);
	const root = path.dirname(lock);
	const pause = path.join(root, "pause");
	await mkdir(pause);
	await writeFile(path.join(pause, "after-pid-write.on"), "");
	await writeFile(path.join(pause, "after-read-back.on"), "");
	const sleeper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
	t.after(() => {
		if (sleeper.exitCode === null && sleeper.signalCode === null) sleeper.kill("SIGKILL");
	});
	t.after(() => releasePauses(pause));
	const holder = run(t, lock, 'require("node:fs").writeFileSync(process.argv[1], "ran\\n")', [log], {
		TS_E2E_LOCK_PAUSE_DIR: pause,
	});
	await waitFor("pause after pid write", async () => (await pausePids(pause, "after-pid-write")).length === 1);
	const [pid] = await pausePids(pause, "after-pid-write");
	await writeFile(path.join(lock, "pid"), `${sleeper.pid}\n`);
	await rm(path.join(pause, "after-pid-write.on"), { force: true });
	await writeFile(path.join(pause, `after-pid-write.${pid}.go`), "");
	let lost = false;
	let passedReadBack = false;
	await waitFor("read-back rejects the foreign pid", async () => {
		if ((await pausePids(pause, "after-read-back")).includes(pid)) {
			passedReadBack = true;
			return true;
		}
		const trace = await readFile(path.join(pause, "trace"), "utf8").catch(() => "");
		if (trace.split("\n").includes(`lost-pid ${pid}`)) {
			lost = true;
			return true;
		}
		return false;
	});
	assert.equal(passedReadBack, false);
	assert.equal(lost, true);
	await assert.rejects(access(log));
	holder.child.kill("SIGKILL");
});

test("the command does not run when the directory changes after the pid read-back", {
	timeout: 20000,
}, async (t) => {
	const { lock, log } = await fixture(t);
	const root = path.dirname(lock);
	const pause = path.join(root, "pause");
	await mkdir(pause);
	await writeFile(path.join(pause, "after-read-back.on"), "");
	await writeFile(path.join(pause, "after-dir-check.on"), "");
	t.after(() => releasePauses(pause));
	const holder = run(t, lock, 'require("node:fs").writeFileSync(process.argv[1], "ran\\n")', [log], {
		TS_E2E_LOCK_PAUSE_DIR: pause,
	});
	await waitFor("pause after pid read-back", async () => (await pausePids(pause, "after-read-back")).length === 1);
	const [pid] = await pausePids(pause, "after-read-back");
	const moved = `${lock}.other`;
	await rename(lock, moved);
	await mkdir(lock);
	await writeFile(path.join(lock, "pid"), `${pid}\n`);
	await rm(path.join(pause, "after-read-back.on"), { force: true });
	await writeFile(path.join(pause, `after-read-back.${pid}.go`), "");
	let lost = false;
	let passedDirCheck = false;
	await waitFor("second check rejects the new directory", async () => {
		if ((await pausePids(pause, "after-dir-check")).includes(pid)) {
			passedDirCheck = true;
			return true;
		}
		const trace = await readFile(path.join(pause, "trace"), "utf8").catch(() => "");
		if (trace.split("\n").includes(`lost-pid ${pid}`)) {
			lost = true;
			return true;
		}
		return false;
	});
	assert.equal(passedDirCheck, false);
	assert.equal(lost, true);
	await assert.rejects(access(log));
	holder.child.kill("SIGKILL");
});
