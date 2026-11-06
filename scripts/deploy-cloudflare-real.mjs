import { spawnSync } from "node:child_process";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { deployPlan } from "./deploy-cloudflare.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const serverDirectory = join(root, "apps/web/dist/server");
const kitLink = join(root, "node_modules/@tensquads/agent-kit");
const kitTarget = join(root, "tools/agent-kit/node_modules/@tensquads/agent-kit");
const kitKeyFile = join(homedir(), ".ssh", "kit");

export const realMasterMarker = "createMaster";
export const masterStubMarker = "openMasterStub";

const kitMissing = "The kit deploy key is absent.";
const kitInstallFailed = "The agent kit install did not finish.";
const kitHostFailed = "The kit host key was not collected.";
const buildFailed = "The real Worker build did not finish.";
const deployFailed = "The real Worker deploy did not finish.";

export function realDeployArgs(dryRun) {
	const args = ["deploy", "--env", "real"];
	if (dryRun) args.push("--dry-run");
	return args;
}

export function realBuildEnv(parentEnv) {
	const env = { ...parentEnv, CLOUDFLARE_ENV: "real" };
	delete env.KIT_DEPLOY_KEY;
	return env;
}

export function realBundleVerdict(source) {
	if (source.includes(masterStubMarker) || source.includes("master-stub.ts")) {
		return { ok: false, message: "The real bundle contains the master stub." };
	}
	if (!source.includes(realMasterMarker)) {
		return { ok: false, message: "The real bundle does not contain createMaster." };
	}
	return { ok: true };
}

export function readBundleSource(directory) {
	const files = [];
	collectJs(directory, files);
	return files.map((path) => readFileSync(path, "utf8")).join("\n");
}

function collectJs(directory, files) {
	if (!existsSync(directory)) return;
	for (const name of readdirSync(directory)) {
		if (name === ".vite") continue;
		const path = join(directory, name);
		if (lstatSync(path).isDirectory()) collectJs(path, files);
		else if (name.endsWith(".js")) files.push(path);
	}
}

export function kitLinked(linkPath = kitLink, targetPath = kitTarget) {
	try {
		if (!lstatSync(linkPath).isSymbolicLink()) return false;
		if (!existsSync(targetPath)) return false;
		return realpathSync(linkPath) === realpathSync(targetPath);
	} catch {
		return false;
	}
}

export function prepareKitKey(env, files) {
	const key = typeof env.KIT_DEPLOY_KEY === "string" ? env.KIT_DEPLOY_KEY : "";
	if (key.trim().length > 0) {
		files.write(files.keyFile, key.endsWith("\n") ? key : `${key}\n`);
	} else if (!files.exists(files.keyFile)) {
		return { ok: false, message: kitMissing };
	}
	return { ok: true, sshCommand: `ssh -i ${files.keyFile} -o IdentitiesOnly=yes` };
}

function knownHostReady(text) {
	return text.split("\n").some((line) => line.startsWith("github.com ") || line.startsWith("github.com,"));
}

function defaultPrepareKit(env) {
	const prepared = prepareKitKey(env, {
		keyFile: kitKeyFile,
		exists: existsSync,
		write(file, key) {
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, key, { mode: 0o600 });
		},
	});
	if (!prepared.ok) return prepared;
	const known = join(homedir(), ".ssh", "known_hosts");
	const current = existsSync(known) ? readFileSync(known, "utf8") : "";
	if (knownHostReady(current)) return prepared;
	const scan = spawnSync("ssh-keyscan", ["github.com"], { encoding: "utf8" });
	if (scan.status !== 0 || typeof scan.stdout !== "string" || scan.stdout.trim().length === 0) {
		return { ok: false, message: kitHostFailed };
	}
	writeFileSync(known, `${current}${current.endsWith("\n") || current.length === 0 ? "" : "\n"}${scan.stdout}`, {
		mode: 0o644,
	});
	return prepared;
}

function defaultLinkKit() {
	mkdirSync(dirname(kitLink), { recursive: true });
	if (existsSync(kitLink)) rmSync(kitLink, { recursive: true, force: true });
	symlinkSync(kitTarget, kitLink);
	return kitLinked() ? { ok: true } : { ok: false, message: kitInstallFailed };
}

function childStatus(result) {
	if (!result || result.error) return 1;
	if (result.status === 0) return 0;
	return result.status ?? 1;
}

function stop(message) {
	console.error(message);
	return 1;
}

function withoutKitKey(env) {
	const copy = { ...env };
	delete copy.KIT_DEPLOY_KEY;
	return copy;
}

export async function runRealDeploy(options) {
	const dryRun = options.dryRun === true;
	const parentEnv = options.parentEnv ?? {};
	const plan = deployPlan(options.envText ?? "", parentEnv);
	if (!plan.ok) return stop(plan.message);
	const linked = (options.kitLinked ?? kitLinked)();
	if (!linked) {
		const prepared = (options.prepareKit ?? defaultPrepareKit)(parentEnv);
		if (!prepared.ok) return stop(prepared.message);
		const installEnv = withoutKitKey(parentEnv);
		installEnv.GIT_SSH_COMMAND = prepared.sshCommand;
		const installed = options.spawn("npm", ["ci", "--prefix", "tools/agent-kit"], {
			cwd: root,
			env: installEnv,
			stdio: "inherit",
		});
		if (childStatus(installed) !== 0) return stop(kitInstallFailed);
		const linkedNow = (options.linkKit ?? defaultLinkKit)();
		if (!linkedNow.ok) return stop(linkedNow.message);
	}
	const built = options.spawn("npm", ["run", "build", "-w", "@tensquads/web"], {
		cwd: root,
		env: realBuildEnv(parentEnv),
		stdio: "inherit",
	});
	if (childStatus(built) !== 0) return stop(buildFailed);
	const source = (options.readBundle ?? (() => readBundleSource(serverDirectory)))();
	const verdict = realBundleVerdict(source);
	if (!verdict.ok) return stop(verdict.message);
	const deployed = options.spawn(plan.command, [plan.args[0], ...realDeployArgs(dryRun)], {
		cwd: plan.cwd,
		env: { ...withoutKitKey(plan.env), CLOUDFLARE_ENV: "real" },
		stdio: plan.stdio,
	});
	if (childStatus(deployed) !== 0) return stop(deployFailed);
	return 0;
}

function readEnvFile() {
	try {
		return readFileSync(resolve(root, ".env"), "utf8");
	} catch {
		return "";
	}
}

function isDirectRun() {
	const entry = process.argv[1];
	if (!entry) return false;
	try {
		return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
	} catch {
		return pathToFileURL(entry).href === import.meta.url;
	}
}

if (isDirectRun()) {
	process.exit(
		await runRealDeploy({
			envText: readEnvFile(),
			parentEnv: process.env,
			dryRun: process.argv.includes("--dry-run"),
			spawn: (command, args, options) => spawnSync(command, args, options),
		}),
	);
}
