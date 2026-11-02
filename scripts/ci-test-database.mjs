import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Client } from "@neondatabase/serverless";

// CREATE DATABASE and DROP DATABASE cannot run through a pooler.
const POOLER_SUFFIX = "-pooler";

function safePart(value) {
	return String(value ?? "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

function isPrivateName(name) {
	return /^ci_[a-z0-9_]+$/.test(name);
}

export function buildDatabaseName({ runId, attempt, os }) {
	const parts = [safePart(runId), safePart(attempt), safePart(os)];
	if (parts.some((part) => part.length === 0)) {
		throw new Error("A CI database name needs a run id, an attempt, and an OS.");
	}
	const name = `ci_${parts.join("_")}`;
	if (!isPrivateName(name)) throw new Error("The CI database name is not a safe identifier.");
	return name;
}

function decodeDatabaseName(value) {
	try {
		return decodeURIComponent(value);
	} catch {
		throw new Error("The database name encoding is not valid.");
	}
}

function databaseName(value) {
	let parsed;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error("The database URL is not valid.");
	}
	const name = decodeDatabaseName(parsed.pathname.replace(/^\//, "").split("/")[0] ?? "");
	if (name.length === 0) throw new Error("The database URL has no database name.");
	return name;
}

function directHostname(hostname) {
	return hostname
		.split(".")
		.map((label) => {
			if (!label.toLowerCase().endsWith(POOLER_SUFFIX)) return label;
			const next = label.slice(0, -POOLER_SUFFIX.length);
			if (next.length === 0) throw new Error("The database host is not valid.");
			return next;
		})
		.join(".");
}

export function directUrl(value) {
	const parsed = new URL(value);
	parsed.hostname = directHostname(parsed.hostname);
	return parsed.href;
}

function databaseUrl(adminUrl, name) {
	if (!isPrivateName(name)) throw new Error("refusing an unsafe database name");
	const parsed = new URL(adminUrl);
	parsed.pathname = `/${name}`;
	return parsed.href;
}

function quoteIdent(name) {
	if (!isPrivateName(name)) throw new Error("refusing an unsafe database name");
	return `"${name}"`;
}

export function refuseNeon({ name, sourceUrl, neonUrl }) {
	const sourceDatabase = databaseName(sourceUrl);
	const privateDatabase = decodeDatabaseName(name);
	// The production database is named neondb. CI does not receive the Neon URL.
	if (sourceDatabase === "neondb" || privateDatabase === "neondb") {
		throw new Error("refusing the Neon connection");
	}
	if (!neonUrl) return;
	const neonDatabase = databaseName(neonUrl);
	if (sourceDatabase === neonDatabase || privateDatabase === neonDatabase) {
		throw new Error("refusing the Neon connection");
	}
}

export function refuseDrop(name) {
	if (!isPrivateName(name)) throw new Error("refusing to drop a database outside the ci_ prefix");
}

function isDependabot(env) {
	return env.GITHUB_ACTIONS === "true" && env.GITHUB_ACTOR === "dependabot[bot]";
}

function requireAdminUrl(env) {
	const url = env.TEST_DATABASE_URL ?? "";
	if (url.length > 0) return url;
	if (isDependabot(env)) return "";
	throw new Error("TEST_DATABASE_URL is missing.");
}

function nameFromEnv(env) {
	return buildDatabaseName({
		runId: env.GITHUB_RUN_ID,
		attempt: env.GITHUB_RUN_ATTEMPT,
		os: env.RUNNER_OS,
	});
}

function maskDatabaseUrl(url, mask) {
	const parsed = new URL(url);
	if (parsed.password.length > 0) mask(parsed.password);
	mask(url);
}

export async function createPrivateDatabase({ env, query, mask, writeEnv }) {
	const source = requireAdminUrl(env);
	if (source.length === 0) return "skip";
	const name = nameFromEnv(env);
	refuseNeon({ name, sourceUrl: source, neonUrl: env.NEON_POSTGRES_CONNECTION_STRING });
	const admin = directUrl(source);
	const created = databaseUrl(admin, name);
	maskDatabaseUrl(admin, mask);
	maskDatabaseUrl(created, mask);
	await query(admin, `CREATE DATABASE ${quoteIdent(name)}`);
	writeEnv(created);
	return name;
}

export async function dropPrivateDatabase({ env, query, mask }) {
	const source = requireAdminUrl(env);
	if (source.length === 0) return "skip";
	const name = nameFromEnv(env);
	refuseDrop(name);
	refuseNeon({ name, sourceUrl: source, neonUrl: env.NEON_POSTGRES_CONNECTION_STRING });
	const admin = directUrl(source);
	maskDatabaseUrl(admin, mask);
	await query(admin, `DROP DATABASE IF EXISTS ${quoteIdent(name)} WITH (FORCE)`);
	return name;
}

function commandError(error) {
	const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : "";
	if (code.length > 0) return new Error(`The database command failed (${code}).`);
	return new Error("The database command failed.");
}

async function queryDirect(connectionString, sql) {
	const client = new Client(connectionString);
	try {
		await client.connect();
		await client.query(sql);
	} catch (error) {
		throw commandError(error);
	} finally {
		await client.end().catch(() => undefined);
	}
}

function writeGitHubEnv(file, url) {
	const marker = "CI_TEST_DATABASE_URL";
	appendFileSync(file, `TEST_DATABASE_URL<<${marker}\n${url}\n${marker}\n`);
}

function maskValue(value) {
	if (process.env.GITHUB_ACTIONS !== "true") return;
	process.stdout.write(`::add-mask::${value}\n`);
}

async function main() {
	const mode = process.argv[2];
	if (mode !== "create" && mode !== "drop") {
		process.stderr.write("Usage: node scripts/ci-test-database.mjs <create|drop>\n");
		process.exitCode = 1;
		return;
	}
	const env = process.env;
	if (mode === "drop") {
		await dropPrivateDatabase({ env, query: queryDirect, mask: maskValue });
		return;
	}
	const file = env.GITHUB_ENV ?? "";
	if ((env.TEST_DATABASE_URL ?? "").length > 0 && file.length === 0) {
		throw new Error("GITHUB_ENV is missing.");
	}
	await createPrivateDatabase({
		env,
		query: queryDirect,
		mask: maskValue,
		writeEnv: (url) => writeGitHubEnv(file, url),
	});
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	main().catch((error) => {
		const message = error instanceof Error ? error.message : "The database command failed.";
		process.stderr.write(`${message}\n`);
		process.exitCode = 1;
	});
}
