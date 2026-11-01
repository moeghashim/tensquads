import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

function parseEnv(text) {
	const entries = new Map();
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0 || trimmed.startsWith("#")) {
			continue;
		}
		const splitAt = trimmed.indexOf("=");
		if (splitAt === -1) {
			continue;
		}
		const key = trimmed.slice(0, splitAt).trim();
		let value = trimmed.slice(splitAt + 1).trim();
		const quote = value[0];
		if ((quote === "'" || quote === '"') && value.endsWith(quote) && value.length >= 2) {
			value = value.slice(1, -1);
		}
		entries.set(key, value);
	}
	return entries;
}

function readDotEnv() {
	try {
		return parseEnv(readFileSync(resolve(root, ".env"), "utf8"));
	} catch {
		return new Map();
	}
}

function clerkKeys(raw) {
	if (!raw) {
		return { publishable: "", secret: "" };
	}
	try {
		const parsed = JSON.parse(raw);
		const development = parsed.development ?? {};
		const publishable = development.publishable_key;
		const secret = development.secret_key;
		return {
			publishable: typeof publishable === "string" ? publishable : "",
			secret: typeof secret === "string" ? secret : "",
		};
	} catch {
		return { publishable: "", secret: "" };
	}
}

function first(...values) {
	for (const value of values) {
		if (typeof value === "string" && value.length > 0) {
			return value;
		}
	}
	return "";
}

export function localSecrets() {
	const file = readDotEnv();
	const clerk = clerkKeys(file.get("CLERK_ENVIRONMENTS"));
	return {
		publishable: first(process.env.CLERK_PUBLISHABLE_KEY, process.env.VITE_CLERK_PUBLISHABLE_KEY, clerk.publishable),
		secret: first(process.env.CLERK_SECRET_KEY, clerk.secret),
		neon: first(process.env.NEON_POSTGRES_CONNECTION_STRING, file.get("NEON_POSTGRES_CONNECTION_STRING")),
		testDatabase: first(process.env.TEST_DATABASE_URL, file.get("TEST_DATABASE_URL")),
		cloudflareToken: first(process.env.CLOUDFLARE_API_TOKEN, file.get("CLOUDFLARE_WORKERS_API_TOKEN")),
		cloudflareAccount: first(process.env.CLOUDFLARE_ACCOUNT_ID, file.get("CLOUDFLARE_WORKERS_ACCOUNT_ID")),
	};
}

function quote(value) {
	return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "")}"`;
}

function writeDevVars() {
	const secrets = localSecrets();
	const lines = [
		`CLERK_PUBLISHABLE_KEY=${quote(secrets.publishable)}`,
		`CLERK_SECRET_KEY=${quote(secrets.secret)}`,
		`NEON_POSTGRES_CONNECTION_STRING=${quote(secrets.neon)}`,
		`TEST_DATABASE_URL=${quote(secrets.testDatabase)}`,
	];
	writeFileSync(resolve(root, "apps/web/.dev.vars"), `${lines.join("\n")}\n`, { mode: 0o600 });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	writeDevVars();
}
