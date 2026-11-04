import assert from "node:assert/strict";
import test from "node:test";
import { BoatApi, Configuration, type Sandbox } from "@boatdev/sdk";

import { createBoatMachine } from "../../src/boat-machine.ts";
import { cleanupTrial, formatCleanup } from "./cleanup.ts";
import { assertMachineEnv, boatVariableNames } from "./env-check.ts";
import { SECRET_BASE_URL, SECRET_NAME, TRIAL_PROFILE, trialIdentity } from "./identity.ts";

const live = process.env.MACHINE_TRIAL === "1";

function requireCredential(name: "BOAT_API_KEY" | "BOAT_ADMIN_API_KEY"): string {
	const value = process.env[name] ?? "";
	if (!value) throw new Error(`The boat trial credential ${name} is absent.`);
	return value;
}

function client(token: string): BoatApi {
	return new BoatApi(new Configuration({ accessToken: token }));
}

async function findTrial(machine: BoatApi, runId: string, agentId: string): Promise<Sandbox> {
	const listed = await machine.sandboxes({ label: [`run=${runId}`, `agent=${agentId}`], limit: 20 });
	const row = listed.sandboxes.find((sandbox) => sandbox.labels?.run === runId && sandbox.labels?.agent === agentId);
	assert.ok(row, "The trial machine is missing.");
	return row;
}

function finishedCommand(result: Awaited<ReturnType<BoatApi["command"]>>): { exitCode: number | null; stdout: string } {
	if (!("stdout" in result) || !("exitCode" in result)) throw new Error("The env command did not finish.");
	return { exitCode: result.exitCode, stdout: result.stdout };
}

async function readEnv(machine: BoatApi, sandboxId: string, expected: Record<string, string>, secrets: string[]) {
	const result = finishedCommand(
		await machine.command({
			sandboxId,
			commandRequest: { command: "env", timeoutSeconds: 30 },
		}),
	);
	assert.equal(result.exitCode, 0, "The env command failed.");
	assertMachineEnv(result.stdout, expected, secrets);
	console.log(`boat variables: ${boatVariableNames(result.stdout).join(", ")}`);
}

test("a real machine follows the trial path", { timeout: 16 * 60 * 1000, skip: !live }, async () => {
	const token = requireCredential("BOAT_API_KEY");
	const adminToken = requireCredential("BOAT_ADMIN_API_KEY");
	const trial = trialIdentity(process.env.GITHUB_RUN_ID ?? "");
	const machine = client(token);
	const admin = client(adminToken);
	const adapter = createBoatMachine({
		token,
		adminToken,
		profileName: TRIAL_PROFILE,
		secretBaseUrl: SECRET_BASE_URL,
		runId: trial.runId,
		wait: { intervalMs: 2_000, timeoutMs: 180_000 },
	});
	const secrets = [token, adminToken];
	try {
		const template = await adapter.makeTemplate(trial.scope, trial.imageId, trial.version);
		assert.equal(template.id, trial.templateId);
		console.log("done: template");
		const started = await adapter.startFromTemplate(trial.scope, template.id, trial.agentId);
		assert.deepEqual(started, { templateId: template.id, agentId: trial.agentId });
		const row = await findTrial(machine, trial.runId, trial.agentId);
		const described = row as Sandbox & { noEnv?: boolean };
		console.log(
			`sandbox.environment=${described.environment ?? "null"} sandbox.ttlSeconds=${described.ttlSeconds ?? "null"} sandbox.noEnv=${described.noEnv === undefined ? "absent" : described.noEnv}`,
		);
		assert.notEqual(described.noEnv, false);
		assert.equal(described.ttlSeconds ?? null, null);
		assert.equal(described.labels?.account, trial.accountId);
		assert.equal(described.labels?.image, trial.tag);
		console.log("done: start from template");
		assert.equal(await adapter.host(trial.scope, trial.agentId), `vps-${trial.agentId}-01`);
		assert.equal(await adapter.region(trial.scope, trial.agentId), "EU");
		assert.match(await adapter.size(trial.scope, trial.agentId), /^\d+ vCPU · \d+ GB$/);
		assert.match(await adapter.cpu(trial.scope, trial.agentId), /^\d+%$/);
		assert.equal(await adapter.uptime(trial.scope, trial.agentId), "Just started");
		assert.deepEqual(await adapter.egress(trial.scope, trial.agentId), []);
		assert.deepEqual(await adapter.secrets(trial.scope, trial.agentId), []);
		console.log("done: dashboard fields");
		await readEnv(
			machine,
			row.id,
			{ ACCOUNT_ID: trial.accountId, TENSQUADS_AGENT_ID: trial.agentId, IMAGE_TAG: trial.tag },
			secrets,
		);
		console.log("done: env");
		await adapter.registerSecret(trial.scope, SECRET_NAME);
		assert.deepEqual(await adapter.secrets(trial.scope, trial.agentId), [SECRET_NAME]);
		assert.deepEqual(await adapter.egress(trial.scope, trial.agentId), ["example.com"]);
		await readEnv(
			machine,
			row.id,
			{ ACCOUNT_ID: trial.accountId, TENSQUADS_AGENT_ID: trial.agentId, IMAGE_TAG: trial.tag },
			secrets,
		);
		console.log("done: secret name");
		await adapter.stop(trial.scope, trial.agentId);
		assert.equal(await adapter.cpu(trial.scope, trial.agentId), "0%");
		assert.equal(await adapter.uptime(trial.scope, trial.agentId), "Paused");
		console.log("done: stop paused");
		await adapter.resume(trial.scope, trial.agentId);
		const again = await findTrial(machine, trial.runId, trial.agentId);
		assert.equal(["ready", "idle", "running"].includes(again.state), true);
		const file = await machine.readFile({ sandboxId: again.id, path: "/home/user/tensquads-image" });
		assert.equal(file.content, `${trial.imageId}\n${trial.version}\n`);
		console.log("done: start again");
		await adapter.remove(trial.scope, trial.agentId);
		const gone = await machine.sandboxes({ label: [`run=${trial.runId}`], limit: 20 });
		assert.equal(
			gone.sandboxes.some((sandbox) => sandbox.id === again.id),
			false,
		);
		console.log("done: machine removed");
		await adapter.removeTemplate(trial.scope, trial.templateId);
		await adapter.removeSecret(trial.scope, SECRET_NAME);
		console.log("done: template and secret removed");
	} finally {
		const report = await cleanupTrial(machine, admin, trial);
		console.log(formatCleanup(trial, report));
		assert.equal(report.sandboxes.length + report.snapshots.length + report.customApis.length, 0);
	}
});
