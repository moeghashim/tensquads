import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const script = path.resolve(process.env.TS_E2E_LOCK_SCRIPT ?? "scripts/with-verify-lock.sh");
const shell = process.env.TS_E2E_LOCK_SHELL ?? "sh";

async function fixture(t) {
	const root = await mkdtemp(path.resolve("scripts/test/.verify-lock-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	return { lock: path.join(root, "ts-e2e.lock"), log: path.join(root, "log"), root };
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

async function releasePauses(pause) {
	const names = await readdir(pause).catch(() => []);
	await Promise.all(
		names
			.filter((name) => name.endsWith(".ready"))
			.map((name) => writeFile(path.join(pause, name.replace(/\.ready$/, ".go")), "").catch(() => {})),
	);
}

async function arm(pause, points) {
	await mkdir(pause, { recursive: true });
	for (const point of points) {
		await writeFile(path.join(pause, `${point}.on`), "");
	}
}

async function disarm(pause, point, pid) {
	await rm(path.join(pause, `${point}.on`), { force: true });
	await writeFile(path.join(pause, `${point}.${pid}.go`), "");
}

async function age(target) {
	const past = new Date(Date.now() - 125 * 60 * 1000);
	await utimes(target, past, past);
}

async function lockPid(lock) {
	return (await readFile(path.join(lock, "pid"), "utf8").catch(() => "")).trim();
}

async function traceHas(pause, line) {
	const trace = await readFile(path.join(pause, "trace"), "utf8").catch(() => "");
	return trace.split("\n").includes(line);
}

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
	await sleep(1000);
	assert.equal(waiter.child.exitCode, null);
	await assert.rejects(access(log));
	assert.equal(await readFile(path.join(lock, "pid"), "utf8"), `${holder.pid}\n`);
	holder.kill("SIGKILL");
	await holderExited;
	assert.deepEqual(await waiter.exited, [0, null]);
	assert.equal(await readFile(log, "utf8"), "got\n");
});

test("a lock-script ancestor does not wait or remove the lock", { timeout: 10000 }, async (t) => {
	const { lock } = await fixture(t);
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
		["", script],
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
	await sleep(1000);
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

// B has passed its last check and waits. A then takes the lock and runs.
// B must leave A's lock in place. B must not run beside A.
test("a reclaimer paused after its final check leaves the live lock in place", {
	timeout: 40000,
}, async (t) => {
	const { lock, log, root } = await fixture(t);
	const pause = path.join(root, "pause");
	const release = path.join(root, "release");
	const token = path.join(root, "in-section");
	await arm(pause, ["after-final-check"]);
	await mkdir(lock);
	await age(lock);
	t.after(async () => {
		await writeFile(release, "").catch(() => {});
		await releasePauses(pause);
	});
	const env = { TS_E2E_LOCK_PAUSE_DIR: pause };
	const args = [log, release, token];
	const paused = run(t, lock, holdSection, args, env);
	await waitFor("pause after the final check", async () => (await pausePids(pause, "after-final-check")).length === 1);
	const [pausedPid] = await pausePids(pause, "after-final-check");
	await rm(path.join(pause, "after-final-check.on"), { force: true });

	const holder = run(t, lock, holdSection, args, env);
	await waitFor(
		"holder enters the section",
		async () => {
			const text = await readFile(log, "utf8").catch(() => "");
			return text.includes("S\n");
		},
		20000,
	);
	const holderPid = await lockPid(lock);
	const holderInode = (await stat(lock)).ino;
	assert.notEqual(holderPid, "");
	assert.notEqual(holderPid, pausedPid);
	// The previous script pauses here after it moves the directory.
	// Arm the pause so the move stays visible. This script has no such pause.
	await writeFile(path.join(pause, "before-aged-judge.on"), "");

	await disarm(pause, "after-final-check", pausedPid);
	await waitFor("paused reclaimer finishes its attempt", async () => {
		const text = await readFile(log, "utf8").catch(() => "");
		if (text.includes("OVERLAP") || text.split("S\n").length > 2) return true;
		if ((await lockPid(lock)) !== holderPid) return true;
		return traceHas(pause, `lost-pid ${pausedPid}`);
	});
	const third = run(t, lock, holdSection, args, env);
	await sleep(1000);
	assert.equal(await lockPid(lock), holderPid);
	assert.equal((await stat(lock)).ino, holderInode);
	assert.equal(await readFile(log, "utf8"), "S\n");

	await writeFile(release, "");
	assert.deepEqual(await paused.exited, [0, null]);
	assert.deepEqual(await holder.exited, [0, null]);
	assert.deepEqual(await third.exited, [0, null]);
	assert.equal(await readFile(log, "utf8"), "S\nE\nS\nE\nS\nE\n");
});

// The acquirer has created the directory and waits before the pid create.
// A reclaimer then claims that directory. The acquirer must not remove it.
test("a fresh acquirer paused before the pid create does not remove the directory", {
	timeout: 40000,
}, async (t) => {
	const { lock, log, root } = await fixture(t);
	const pause = path.join(root, "pause");
	const release = path.join(root, "release");
	const token = path.join(root, "in-section");
	await arm(pause, ["after-mkdir"]);
	t.after(async () => {
		await writeFile(release, "").catch(() => {});
		await releasePauses(pause);
	});
	const env = { TS_E2E_LOCK_PAUSE_DIR: pause };
	const args = [log, release, token];
	const acquirer = run(t, lock, holdSection, args, env);
	await waitFor("pause after mkdir", async () => (await pausePids(pause, "after-mkdir")).length === 1);
	const [acquirerPid] = await pausePids(pause, "after-mkdir");
	const created = (await stat(lock)).ino;
	await age(lock);

	const reclaimer = run(t, lock, holdSection, args);
	await waitFor(
		"reclaimer enters the section",
		async () => {
			const text = await readFile(log, "utf8").catch(() => "");
			return text.includes("S\n");
		},
		20000,
	);
	assert.equal((await stat(lock)).ino, created);
	assert.equal(await lockPid(lock), String(reclaimer.child.pid));
	assert.equal(await readFile(log, "utf8"), "S\n");

	await disarm(pause, "after-mkdir", acquirerPid);
	await waitFor("acquirer loses the create", async () => traceHas(pause, `lost-pid ${acquirerPid}`));
	assert.equal((await stat(lock)).ino, created);
	assert.equal(await lockPid(lock), String(reclaimer.child.pid));
	assert.equal(await readFile(log, "utf8"), "S\n");

	await writeFile(release, "");
	assert.deepEqual(await acquirer.exited, [0, null]);
	assert.deepEqual(await reclaimer.exited, [0, null]);
	assert.equal(await readFile(log, "utf8"), "S\nE\nS\nE\n");
});

test("an aged empty or non-numeric pid file is reclaimed after 120 minutes", { timeout: 20000 }, async (t) => {
	for (const content of ["", "not-a-pid\n"]) {
		const { lock, log } = await fixture(t);
		await mkdir(lock);
		const pidFile = path.join(lock, "pid");
		await writeFile(pidFile, content);
		await age(pidFile);
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
		await age(lock);
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

test("the command does not run when the directory disappears before the pid create", {
	timeout: 20000,
}, async (t) => {
	const { lock, log, root } = await fixture(t);
	const pause = path.join(root, "pause");
	const release = path.join(root, "release");
	const token = path.join(root, "in-section");
	await arm(pause, ["after-mkdir"]);
	t.after(async () => {
		await writeFile(release, "").catch(() => {});
		await releasePauses(pause);
	});
	const args = [log, release, token];
	const holder = run(t, lock, holdSection, args, { TS_E2E_LOCK_PAUSE_DIR: pause });
	await waitFor("pause after mkdir", async () => (await pausePids(pause, "after-mkdir")).length === 1);
	const [pid] = await pausePids(pause, "after-mkdir");
	await rename(lock, `${lock}.stolen`);
	const peer = run(t, lock, holdSection, args);
	await waitFor("peer holds the lock", async () => {
		const text = await readFile(log, "utf8").catch(() => "");
		return text.includes("S\n");
	});
	await disarm(pause, "after-mkdir", pid);
	await waitFor("holder backs off", async () => traceHas(pause, `lost-pid ${pid}`));
	await writeFile(release, "");
	assert.deepEqual(await holder.exited, [0, null]);
	assert.deepEqual(await peer.exited, [0, null]);
	assert.equal(await readFile(log, "utf8"), "S\nE\nS\nE\n");
});

test("the command does not run when the pid file changes after the create", { timeout: 20000 }, async (t) => {
	const { lock, log, root } = await fixture(t);
	const pause = path.join(root, "pause");
	await arm(pause, ["after-pid-create", "after-read-back"]);
	const sleeper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
	t.after(() => {
		if (sleeper.exitCode === null && sleeper.signalCode === null) sleeper.kill("SIGKILL");
	});
	t.after(() => releasePauses(pause));
	const holder = run(t, lock, 'require("node:fs").writeFileSync(process.argv[1], "ran\\n")', [log], {
		TS_E2E_LOCK_PAUSE_DIR: pause,
	});
	await waitFor("pause after the pid create", async () => (await pausePids(pause, "after-pid-create")).length === 1);
	const [pid] = await pausePids(pause, "after-pid-create");
	await writeFile(path.join(lock, "pid"), `${sleeper.pid}\n`);
	await disarm(pause, "after-pid-create", pid);
	let passedReadBack = false;
	await waitFor("read-back rejects the foreign pid", async () => {
		if ((await pausePids(pause, "after-read-back")).includes(pid)) {
			passedReadBack = true;
			return true;
		}
		return traceHas(pause, `lost-pid ${pid}`);
	});
	assert.equal(passedReadBack, false);
	await assert.rejects(access(log));
	assert.equal(await lockPid(lock), String(sleeper.pid));
	holder.child.kill("SIGKILL");
});

test("the command does not run when the directory changes after the pid read-back", {
	timeout: 20000,
}, async (t) => {
	const { lock, log, root } = await fixture(t);
	const pause = path.join(root, "pause");
	await arm(pause, ["after-read-back", "after-dir-check"]);
	t.after(() => releasePauses(pause));
	const holder = run(t, lock, 'require("node:fs").writeFileSync(process.argv[1], "ran\\n")', [log], {
		TS_E2E_LOCK_PAUSE_DIR: pause,
	});
	await waitFor("pause after the pid read-back", async () => (await pausePids(pause, "after-read-back")).length === 1);
	const [pid] = await pausePids(pause, "after-read-back");
	await rename(lock, `${lock}.other`);
	await mkdir(lock);
	await writeFile(path.join(lock, "pid"), `${pid}\n`);
	await disarm(pause, "after-read-back", pid);
	let passedDirCheck = false;
	await waitFor("the inode check rejects the new directory", async () => {
		if ((await pausePids(pause, "after-dir-check")).includes(pid)) {
			passedDirCheck = true;
			return true;
		}
		return traceHas(pause, `lost-pid ${pid}`);
	});
	assert.equal(passedDirCheck, false);
	await assert.rejects(access(log));
	assert.equal(await lockPid(lock), pid);
	holder.child.kill("SIGKILL");
});

test("a claim puts a different pid back when the pid path is empty", { timeout: 20000 }, async (t) => {
	const { lock, log, root } = await fixture(t);
	const pause = path.join(root, "pause");
	await arm(pause, ["after-dead-check"]);
	await mkdir(lock);
	const dead = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
	await once(dead, "exit");
	await writeFile(path.join(lock, "pid"), `${dead.pid}\n`);
	const sleeper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
	t.after(() => {
		if (sleeper.exitCode === null && sleeper.signalCode === null) sleeper.kill("SIGKILL");
	});
	t.after(() => releasePauses(pause));
	const claimer = run(t, lock, 'require("node:fs").writeFileSync(process.argv[1], "ran\\n")', [log], {
		TS_E2E_LOCK_PAUSE_DIR: pause,
	});
	await waitFor("pause after the dead check", async () => (await pausePids(pause, "after-dead-check")).length === 1);
	const [pid] = await pausePids(pause, "after-dead-check");
	await writeFile(path.join(lock, "pid"), `${sleeper.pid}\n`);
	await disarm(pause, "after-dead-check", pid);
	await waitFor("the live pid is restored", async () => (await lockPid(lock)) === String(sleeper.pid));
	await sleep(300);
	await assert.rejects(access(log));
	assert.equal(await lockPid(lock), String(sleeper.pid));
	claimer.child.kill("SIGKILL");
});

test("a claim does not overwrite a pid file that appears before the put-back", {
	timeout: 20000,
}, async (t) => {
	const { lock, log, root } = await fixture(t);
	const pause = path.join(root, "pause");
	await arm(pause, ["after-dead-check", "before-put-back"]);
	await mkdir(lock);
	const dead = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
	await once(dead, "exit");
	await writeFile(path.join(lock, "pid"), `${dead.pid}\n`);
	const first = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
	const second = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
	t.after(() => {
		for (const child of [first, second]) {
			if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
		}
	});
	t.after(() => releasePauses(pause));
	const claimer = run(t, lock, 'require("node:fs").writeFileSync(process.argv[1], "ran\\n")', [log], {
		TS_E2E_LOCK_PAUSE_DIR: pause,
	});
	await waitFor("pause after the dead check", async () => (await pausePids(pause, "after-dead-check")).length === 1);
	const [pid] = await pausePids(pause, "after-dead-check");
	await writeFile(path.join(lock, "pid"), `${first.pid}\n`);
	await disarm(pause, "after-dead-check", pid);
	await waitFor("pause before the put-back", async () => (await pausePids(pause, "before-put-back")).includes(pid));
	await writeFile(path.join(lock, "pid"), `${second.pid}\n`);
	await disarm(pause, "before-put-back", pid);
	await sleep(300);
	await assert.rejects(access(log));
	assert.equal(await lockPid(lock), String(second.pid));
	claimer.child.kill("SIGKILL");
});
