import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const webDirectory = resolve(root, "apps/web");
const wranglerBin = resolve(root, "node_modules/wrangler/bin/wrangler.js");
const blocked = [
	"CLOUDFLARE_API_TOKEN",
	"CF_API_TOKEN",
	"CLOUDFLARE_API_KEY",
	"CF_API_KEY",
	"CLOUDFLARE_EMAIL",
	"CF_EMAIL",
	"CLOUDFLARE_API_USER_SERVICE_KEY",
	"CLOUDFLARE_ACCOUNT_ID",
	"CF_ACCOUNT_ID",
	"WRANGLER_LOG",
	"NEON_POSTGRES_CONNECTION_STRING",
	"BOAT_API_KEY",
	"BOAT_ADMIN_API_KEY",
	"TEST_DATABASE_URL",
	"CLOUDFLARE_WORKERS_API_TOKEN",
];

export function busTrialPlan(env) {
	if (env.BUS_TRIAL !== "1") return { ok: false, message: "The bus trial is off." };
	const runId = env.GITHUB_RUN_ID ?? "";
	if (!/^\d{6,}$/.test(runId)) return { ok: false, message: "The run id is not valid." };
	if (!env.CLOUDFLARE_API_TOKEN?.trim()) {
		return { ok: false, message: "CLOUDFLARE_API_TOKEN is absent." };
	}
	if (!env.CLOUDFLARE_ACCOUNT_ID?.trim()) {
		return { ok: false, message: "CLOUDFLARE_ACCOUNT_ID is absent." };
	}
	if (!env.TEST_DATABASE_URL?.trim()) return { ok: false, message: "TEST_DATABASE_URL is absent." };
	const databaseUrl = env.TEST_DATABASE_URL.trim();
	const live = env.NEON_POSTGRES_CONNECTION_STRING?.trim();
	if (live && databaseUrl === live) return { ok: false, message: "The bus trial must not use the live database." };
	const cleanup = env.BUS_TRIAL_CLEANUP === "1";
	if (!cleanup && !env.BOAT_API_KEY?.trim()) return { ok: false, message: "BOAT_API_KEY is absent." };
	const workerName = `tensquads-trial-${runId}`;
	if (workerName === "tensquads" || !workerName.startsWith("tensquads-trial-")) {
		return { ok: false, message: "The trial worker name is not valid." };
	}
	return {
		ok: true,
		cleanup,
		runId,
		workerName,
		queue: `tensquads-bus-${runId}`,
		deadLetter: `tensquads-bus-dlq-${runId}`,
		accountId: `bus${runId}`,
		agentId: `b${runId}`,
		eventId: `trial-${runId}`,
		databaseUrl,
		boatToken: env.BOAT_API_KEY?.trim() ?? "",
		cloudflareToken: env.CLOUDFLARE_API_TOKEN.trim(),
		cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID.trim(),
	};
}

export function trialConfig(sourceText, plan, workerDirectory = "") {
	const config = JSON.parse(sourceText.replace(/^\s*\/\/.*$/gm, ""));
	if (config.name !== "tensquads") throw new Error("The worker config is not the project worker.");
	if (config.account_id !== plan.cloudflareAccountId) throw new Error("The worker config is not the project account.");
	config.name = plan.workerName;
	// The trial config lives in a temp directory. Wrangler resolves main from that file, so a relative src/worker.ts is not found.
	if (workerDirectory) config.main = resolve(workerDirectory, config.main);
	config.vars = {
		...config.vars,
		ADAPTERS: "real",
		BOAT_PROFILE: "tensquads-agents",
		BOAT_SECRET_BASE_URL: "https://example.com",
	};
	config.queues = {
		producers: [{ binding: "BUS_QUEUE", queue: plan.queue }],
		consumers: [
			{ queue: plan.queue, max_retries: 3, dead_letter_queue: plan.deadLetter },
			{ queue: plan.deadLetter },
		],
	};
	return config;
}

export function redact(text, secrets) {
	let out = text;
	for (const secret of secrets) {
		if (typeof secret === "string" && secret.length >= 8) out = out.split(secret).join("[redacted]");
	}
	return out;
}

export function childEnv(parent, plan) {
	const env = { ...parent };
	for (const key of blocked) delete env[key];
	env.CLOUDFLARE_API_TOKEN = plan.cloudflareToken;
	env.CLOUDFLARE_ACCOUNT_ID = plan.cloudflareAccountId;
	env.CI = "true";
	return env;
}

function secretsOf(plan, machineKey) {
	return [plan.cloudflareToken, plan.databaseUrl, plan.boatToken, machineKey].filter((value) => value.length >= 8);
}

async function waitForEvent(databaseUrl, account, eventId) {
	const { neon } = await import("@neondatabase/serverless");
	const sql = neon(databaseUrl);
	const deadline = Date.now() + 90_000;
	for (;;) {
		const rows = await sql`select id from bus_events where account_id = ${account} and id = ${eventId}`;
		if (rows.length > 0) return true;
		if (Date.now() >= deadline) return false;
		await new Promise((resolve) => setTimeout(resolve, 2_000));
	}
}

async function deleteRows(databaseUrl, account) {
	const { neon } = await import("@neondatabase/serverless");
	const sql = neon(databaseUrl);
	await sql`delete from bus_events where account_id = ${account}`;
	await sql`delete from state_entries where account_id = ${account}`;
	const events = await sql`select id from bus_events where account_id = ${account}`;
	const state = await sql`select key from state_entries where account_id = ${account}`;
	return events.length + state.length;
}

export async function executeBusTrial(plan, deps) {
	const machineKey = randomBytes(32).toString("hex");
	const hidden = secretsOf(plan, machineKey);
	const say = (text) => deps.log(redact(text, hidden));
	let failure = "";
	const directory = deps.tempDir();
	const configPath = resolve(directory, "wrangler.trial.jsonc");
	const secretsPath = resolve(directory, "secrets.json");
	try {
		writeFileSync(configPath, JSON.stringify(trialConfig(deps.source, plan, deps.workerDirectory), null, 2));
		writeFileSync(
			secretsPath,
			JSON.stringify({
				DATABASE_URL: plan.databaseUrl,
				BOAT_TOKEN: plan.boatToken,
				MACHINE_TOKEN_KEY: machineKey,
			}),
			{ mode: 0o600 },
		);
		await deps.run(["queues", "create", plan.queue]);
		await deps.run(["queues", "create", plan.deadLetter]);
		const deployed = await deps.run(["deploy", "--config", configPath, "--secrets-file", secretsPath]);
		const url = redact(deployed.stdout, hidden).match(/https:\/\/[a-z0-9.-]+\.workers\.dev/)?.[0];
		if (!url) throw new Error("The trial worker URL is missing.");
		const { signMachineToken } = await import("../packages/adapters/src/cloudflare-bus/token.ts");
		const token = await signMachineToken(
			machineKey,
			plan.accountId,
			plan.agentId,
			Math.floor(Date.now() / 1000) + 300,
		);
		const event = {
			id: plan.eventId,
			from: plan.agentId,
			to: "master",
			kind: "Task",
			skill: "research",
			text: "Trial.",
			payload: {},
			writes: [],
		};
		const response = await deps.fetch(`${url}/machine/send`, {
			method: "POST",
			headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
			body: JSON.stringify({ accountId: plan.accountId, agentId: plan.agentId, event }),
		});
		if (!response.ok) throw new Error(`The trial send failed with status ${response.status}.`);
		if (!(await deps.waitForEvent(plan.databaseUrl, plan.accountId, plan.eventId))) {
			throw new Error("The trial event did not reach the database.");
		}
	} catch (error) {
		failure = error instanceof Error ? error.message : "The bus trial failed.";
	} finally {
		rmSync(secretsPath, { force: true });
	}
	const left = await deps.cleanup(plan, configPath);
	rmSync(configPath, { force: true });
	if (failure) {
		say(failure);
		return 1;
	}
	if (left.length > 0) {
		say(`bus-cleanup-check run=${plan.runId} left=${left.join(",")}`);
		return 1;
	}
	say(`bus-trial run=${plan.runId} event=${plan.eventId}`);
	return 0;
}

function realRun(plan) {
	return (args) => {
		const result = spawnSync(process.execPath, [wranglerBin, ...args], {
			cwd: webDirectory,
			encoding: "utf8",
			env: childEnv(process.env, plan),
		});
		const hidden = secretsOf(plan, "");
		if ((result.status ?? 1) !== 0) {
			throw new Error(redact(`${result.stderr || result.stdout || "Wrangler failed."}`, hidden));
		}
		return { stdout: result.stdout ?? "" };
	};
}

async function realCleanup(plan) {
	const run = (args) => {
		spawnSync(process.execPath, [wranglerBin, ...args], {
			cwd: webDirectory,
			encoding: "utf8",
			env: childEnv(process.env, plan),
		});
	};
	if (plan.workerName === "tensquads" || !plan.workerName.startsWith("tensquads-trial-")) {
		throw new Error("The trial worker name is not valid.");
	}
	run(["delete", plan.workerName, "--force"]);
	run(["queues", "delete", plan.queue]);
	run(["queues", "delete", plan.deadLetter]);
	const rows = await deleteRows(plan.databaseUrl, plan.accountId).catch(() => 1);
	const queues = spawnSync(process.execPath, [wranglerBin, "queues", "list"], {
		cwd: webDirectory,
		encoding: "utf8",
		env: childEnv(process.env, plan),
	});
	const listed = queues.stdout ?? "";
	const worker = spawnSync(process.execPath, [wranglerBin, "deployments", "status", "--name", plan.workerName], {
		cwd: webDirectory,
		encoding: "utf8",
		env: childEnv(process.env, plan),
	});
	const left = [];
	if (listed.includes(plan.queue)) left.push(plan.queue);
	if (listed.includes(plan.deadLetter)) left.push(plan.deadLetter);
	if ((worker.status ?? 1) === 0) left.push(plan.workerName);
	if (rows !== 0) left.push("rows");
	return left;
}

async function main() {
	const plan = busTrialPlan(process.env);
	if (!plan.ok) {
		console.error(plan.message);
		return 1;
	}
	if (plan.cleanup) {
		const left = await realCleanup(plan);
		console.log(`bus-cleanup-check run=${plan.runId} left=${left.join(",") || "none"}`);
		return left.length === 0 ? 0 : 1;
	}
	const source = readFileSync(resolve(webDirectory, "wrangler.jsonc"), "utf8");
	return executeBusTrial(plan, {
		source,
		workerDirectory: webDirectory,
		log: (text) => console.log(text),
		tempDir: () => mkdtempSync(resolve(tmpdir(), "tensquads-bus-trial-")),
		run: realRun(plan),
		fetch,
		waitForEvent,
		cleanup: (current) => realCleanup(current),
	});
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
	main()
		.then((code) => {
			process.exitCode = code;
		})
		.catch((error) => {
			console.error(error instanceof Error ? redact(error.message, []) : "The bus trial failed.");
			process.exitCode = 1;
		});
}
