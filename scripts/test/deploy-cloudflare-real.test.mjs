import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { deployPlan } from "../deploy-cloudflare.mjs";
import {
	kitLinked,
	prepareKitKey,
	realBuildEnv,
	realBundleVerdict,
	realDeployArgs,
	runRealDeploy,
} from "../deploy-cloudflare-real.mjs";

const rootPackage = JSON.parse(readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"));
const webPackage = JSON.parse(
	readFileSync(fileURLToPath(new URL("../../apps/web/package.json", import.meta.url)), "utf8"),
);

function capture(run) {
	const errors = [];
	const original = console.error;
	console.error = (message) => {
		errors.push(message);
	};
	return run()
		.then((code) => ({ code, errors }))
		.finally(() => {
			console.error = original;
		});
}

test("production deploy stays a plain wrangler deploy", () => {
	assert.equal(rootPackage.scripts["deploy:cloudflare"], "npm run cf:deploy -w @tensquads/web");
	assert.equal(webPackage.scripts["cf:deploy"], "vite build && node ../../scripts/deploy-cloudflare.mjs");
	assert.equal(rootPackage.scripts["deploy:cloudflare:real"], "node scripts/deploy-cloudflare-real.mjs");
	const plan = deployPlan('CLOUDFLARE_WORKERS_API_TOKEN="project-token"\n', {});
	assert.equal(plan.ok, true);
	assert.deepEqual(plan.args.slice(1), ["deploy"]);
	assert.deepEqual(realDeployArgs(false), ["deploy", "--env", "real"]);
	assert.deepEqual(realDeployArgs(true), ["deploy", "--env", "real", "--dry-run"]);
	assert.equal(realBuildEnv({ PATH: "/usr/bin", KIT_DEPLOY_KEY: "hidden-key" }).CLOUDFLARE_ENV, "real");
	assert.equal(realBuildEnv({ KIT_DEPLOY_KEY: "hidden-key" }).KIT_DEPLOY_KEY, undefined);
	assert.equal(realBundleVerdict("function createMaster(request) { return request; }").ok, true);
	assert.equal(realBundleVerdict("function openMasterStub() { return null; }").ok, false);
	assert.equal(realBundleVerdict("function createMaster() {}\n// master-stub.ts").ok, false);
	assert.equal(realBundleVerdict("").ok, false);
});

test("real deploy links the kit, builds with CLOUDFLARE_ENV=real, checks the bundle, and deploys --env real", async () => {
	const calls = [];
	const result = await capture(() =>
		runRealDeploy({
			envText:
				'CLOUDFLARE_WORKERS_API_TOKEN="project-token"\nNEON_POSTGRES_CONNECTION_STRING="postgres://live/db"\n',
			parentEnv: { PATH: "/usr/bin", KIT_DEPLOY_KEY: "hidden-key", CLOUDFLARE_API_TOKEN: "personal" },
			dryRun: true,
			kitLinked: () => false,
			prepareKit() {
				calls.push("prepare");
				return { ok: true, sshCommand: "ssh -i /tmp/kit -o IdentitiesOnly=yes" };
			},
			linkKit() {
				calls.push("link");
				return { ok: true };
			},
			readBundle: () => "export function createMaster(request, ports) { return { request, ports }; }",
			spawn(command, args, options) {
				calls.push({ command, args, env: options.env, cwd: options.cwd });
				return { status: 0 };
			},
		}),
	);
	assert.equal(result.code, 0);
	assert.deepEqual(calls[0], "prepare");
	assert.equal(calls[1].args[0], "ci");
	assert.deepEqual(calls[1].args, ["ci", "--prefix", "tools/agent-kit"]);
	assert.equal(calls[1].env.GIT_SSH_COMMAND, "ssh -i /tmp/kit -o IdentitiesOnly=yes");
	assert.equal(calls[1].env.KIT_DEPLOY_KEY, undefined);
	assert.equal(JSON.stringify(calls).includes("hidden-key"), false);
	assert.deepEqual(calls[2], "link");
	assert.deepEqual(calls[3].args, ["run", "build", "-w", "@tensquads/web"]);
	assert.equal(calls[3].env.CLOUDFLARE_ENV, "real");
	assert.equal(calls[3].env.KIT_DEPLOY_KEY, undefined);
	assert.deepEqual(calls[4].args.slice(1), ["deploy", "--env", "real", "--dry-run"]);
	assert.equal(calls[4].env.CLOUDFLARE_ENV, "real");
	assert.equal(calls[4].env.CLOUDFLARE_API_TOKEN, "project-token");
	assert.equal(calls[4].env.CI, "true");
	assert.equal(calls[4].cwd, fileURLToPath(new URL("../../apps/web", import.meta.url)));
});

test("real deploy skips the kit install when the CI link is already present", async () => {
	const directory = mkdtempSync(join(tmpdir(), "tensquads-kit-"));
	try {
		const target = join(directory, "target");
		const link = join(directory, "link");
		mkdirSync(target);
		symlinkSync(target, link);
		assert.equal(kitLinked(link, target), true);
		const plain = join(directory, "plain");
		writeFileSync(plain, "not a link");
		assert.equal(kitLinked(plain, target), false);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}

	const commands = [];
	const result = await capture(() =>
		runRealDeploy({
			envText: 'CLOUDFLARE_WORKERS_API_TOKEN="project-token"\n',
			parentEnv: { PATH: "/usr/bin" },
			kitLinked: () => true,
			prepareKit() {
				throw new Error("prepare");
			},
			readBundle: () => "function openMasterStub() { return null; }",
			spawn(_command, args) {
				commands.push(args);
				return { status: 0 };
			},
		}),
	);
	assert.equal(result.code, 1);
	assert.deepEqual(result.errors, ["The real bundle contains the master stub."]);
	assert.deepEqual(commands, [["run", "build", "-w", "@tensquads/web"]]);
});

test("real deploy refuses to build when the kit key is absent", async () => {
	const keyDirectory = mkdtempSync(join(tmpdir(), "tensquads-key-"));
	try {
		const missing = prepareKitKey(
			{},
			{
				keyFile: join(keyDirectory, "kit"),
				exists: () => false,
				write() {
					throw new Error("wrote");
				},
			},
		);
		assert.equal(missing.ok, false);
		assert.equal(missing.message.includes("secret"), false);
		let mode = 0;
		const written = prepareKitKey(
			{ KIT_DEPLOY_KEY: "hidden-key" },
			{
				keyFile: join(keyDirectory, "kit"),
				exists: () => false,
				write(_file, key) {
					mode = 0o600;
					assert.equal(key, "hidden-key\n");
				},
			},
		);
		assert.equal(written.ok, true);
		assert.equal(mode, 0o600);
		assert.equal(written.sshCommand.includes("hidden-key"), false);
	} finally {
		rmSync(keyDirectory, { recursive: true, force: true });
	}

	const spawned = [];
	const result = await capture(() =>
		runRealDeploy({
			envText: 'CLOUDFLARE_WORKERS_API_TOKEN="project-token"\n',
			parentEnv: {},
			kitLinked: () => false,
			prepareKit() {
				return { ok: false, message: "The kit deploy key is absent." };
			},
			spawn(_command, args) {
				spawned.push(args);
				return { status: 0 };
			},
		}),
	);
	assert.equal(result.code, 1);
	assert.deepEqual(result.errors, ["The kit deploy key is absent."]);
	assert.deepEqual(spawned, []);
});
