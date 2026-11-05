import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { cleanupTrial } from "./bus-trial-cleanup.mjs";

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

export function trialConfig(sourceText, plan) {
	const config = JSON.parse(sourceText.replace(/^\s*\/\/.*$/gm, ""));
	if (config.name !== "tensquads") throw new Error("The worker config is not the project worker.");
	if (config.account_id !== plan.cloudflareAccountId) throw new Error("The worker config is not the project account.");
	config.name = plan.workerName;
	config.vars = {
		...config.vars,
		ADAPTERS: "real",
		BOAT_PROFILE: "tensquads-agents",
		BOAT_SECRET_BASE_URL: "https://example.com",
		BUS_DEAD_LETTER: plan.deadLetter,
	};
	config.queues = {
		producers: [{ binding: "BUS_QUEUE", queue: plan.queue }],
		consumers: [
			{ queue: plan.queue, max_retries: 3, dead_letter_queue: plan.deadLetter },
			{ queue: plan.deadLetter },
		],
	};
	// Asset routes answer before the Worker. /machine/* has to run the Worker first.
	if (config.assets?.directory) config.assets = { ...config.assets, run_worker_first: ["/machine/*"] };
	config.workers_dev = true;
	return config;
}

export function trialWorkerUrl(stdout, workerName) {
	const matches = stdout.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/g) ?? [];
	for (const url of matches) {
		let hostname = "";
		try {
			hostname = new URL(url).hostname;
		} catch {
			continue;
		}
		const rest = hostname.slice(workerName.length);
		if (hostname.startsWith(workerName) && /^\.[a-z0-9-]+\.workers\.dev$/.test(rest)) return url;
	}
	return "";
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

async function trialSql(databaseUrl) {
	const { neon } = await import("@neondatabase/serverless");
	return neon(databaseUrl);
}

export async function createTrialAccount(sql, account) {
	await sql`insert into accounts (id, account_id, name, owner, email, tint, agents, online, tasks, last_active, created_week, mission, sort_order)
		values (${account}, ${account}, '', '', '', '', 0, 0, 0, '', 0, '', 0) on conflict do nothing`;
}

export async function deleteRows(sql, account) {
	await sql`delete from bus_events where account_id = ${account}`;
	await sql`delete from state_entries where account_id = ${account}`;
	await sql`delete from accounts where id = ${account}`;
	const events = await sql`select id from bus_events where account_id = ${account}`;
	const state = await sql`select key from state_entries where account_id = ${account}`;
	const accounts = await sql`select id from accounts where id = ${account}`;
	return events.length + state.length + accounts.length;
}

async function assertTrialResponse(response, url, host, hidden) {
	if (response.ok) return;
	const detail = redact(typeof response.text === "function" ? await response.text().catch(() => "") : "", hidden)
		.replace(/\s+/g, " ")
		.slice(0, 120);
	let location = "";
	try {
		const header = response.headers?.get?.("location") ?? "";
		if (header) {
			const parsed = new URL(header, url);
			location = ` location=${parsed.host}${parsed.pathname}`;
		}
	} catch {
		location = "";
	}
	throw new Error(
		`The trial send failed with status ${response.status} for ${host}.${location}${detail ? ` ${detail}` : ""}`,
	);
}

async function finishTrial(plan, deps, say, proof, configPath) {
	say(proof.line);
	if (proof.failure) say(proof.failure);
	let left = [];
	try {
		left = await deps.cleanup(plan, configPath);
	} catch (error) {
		left = [error instanceof Error ? error.message : "The bus trial cleanup failed."];
	}
	rmSync(configPath, { force: true });
	say(`bus-cleanup-check run=${plan.runId} left=${left.join(",") || "none"}`);
	return proof.failure || left.length > 0 ? 1 : 0;
}

export async function executeBusTrial(plan, deps) {
	const machineKey = randomBytes(32).toString("hex");
	const hidden = secretsOf(plan, machineKey);
	const say = (text) => deps.log(redact(text, hidden));
	let failure = "";
	let status = "failed";
	let database = "absent";
	if (deps.build) await deps.build();
	const sourceText = deps.readSource ? deps.readSource() : deps.source;
	const directory = deps.tempDir();
	const configPath = deps.configPath ?? resolve(directory, "wrangler.trial.json");
	const secretsPath = resolve(directory, "secrets.json");
	try {
		writeFileSync(configPath, JSON.stringify(trialConfig(sourceText, plan), null, 2));
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
		const url = trialWorkerUrl(redact(deployed.stdout, hidden), plan.workerName);
		if (!url) throw new Error("The trial worker URL is missing.");
		const host = new URL(url).host;
		say(`bus-target host=${host}`);
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
		await deps.createAccount(plan.databaseUrl, plan.accountId);
		const response = await deps.fetch(`${url}/machine/send`, {
			method: "POST",
			redirect: "manual",
			headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
			body: JSON.stringify({ accountId: plan.accountId, agentId: plan.agentId, event }),
		});
		status = String(response.status);
		await assertTrialResponse(response, url, host, hidden);
		if (await deps.waitForEvent(plan.databaseUrl, plan.accountId, plan.eventId)) database = "reached";
		else throw new Error("The trial event did not reach the database.");
	} catch (error) {
		failure = error instanceof Error ? error.message : "The bus trial failed.";
	} finally {
		rmSync(secretsPath, { force: true });
	}
	return finishTrial(
		plan,
		deps,
		say,
		{
			line: `bus-trial run=${plan.runId} event=${plan.eventId} status=${status} database=${database}`,
			failure,
		},
		configPath,
	);
}

function realBuild() {
	const env = { ...process.env };
	for (const key of blocked) delete env[key];
	const result = spawnSync(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js"), "build"], {
		cwd: webDirectory,
		encoding: "utf8",
		env,
	});
	if ((result.status ?? 1) !== 0) {
		throw new Error(redact(result.stderr || result.stdout || "The worker build failed.", []));
	}
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

async function cloudflare(plan, method, path) {
	let response;
	try {
		response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
			method,
			headers: {
				authorization: `Bearer ${plan.cloudflareToken}`,
				"content-type": "application/json",
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "The Cloudflare request failed.";
		throw new Error(redact(message, secretsOf(plan, "")));
	}
	const body = await response.json().catch(() => ({}));
	return {
		status: response.status,
		success: response.ok && body.success !== false,
		result: body.result,
		errors: Array.isArray(body.errors) ? body.errors : [],
		result_info: body.result_info ?? null,
	};
}

async function realCleanup(plan) {
	if (plan.workerName === "tensquads" || !plan.workerName.startsWith("tensquads-trial-")) {
		throw new Error("The trial worker name is not valid.");
	}
	const left = await cleanupTrial(plan, (request) => cloudflare(plan, request.method, request.path));
	const rows = await trialSql(plan.databaseUrl)
		.then((sql) => deleteRows(sql, plan.accountId))
		.catch(() => 1);
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
	const builtConfig = resolve(webDirectory, "dist/server/wrangler.json");
	return executeBusTrial(plan, {
		build: realBuild,
		readSource: () => readFileSync(builtConfig, "utf8"),
		configPath: resolve(webDirectory, "dist/server/wrangler.trial.json"),
		log: (text) => console.log(text),
		tempDir: () => mkdtempSync(resolve(tmpdir(), "tensquads-bus-trial-")),
		run: realRun(plan),
		fetch,
		createAccount: async (databaseUrl, account) => createTrialAccount(await trialSql(databaseUrl), account),
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
