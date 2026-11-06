import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseEnv } from "./write-dev-vars.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

const migrationFailed = "The real database migration did not finish.";
const bootstrapFailed = "The real account bootstrap did not finish.";

export function parseRealBootstrapArgs(argv) {
	const map = new Map();
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token.startsWith("--")) continue;
		const key = token.slice(2);
		const value = argv[index + 1];
		if (value === undefined || value.startsWith("--")) return { ok: false, message: `Pass --${key}.` };
		map.set(key, value);
		index += 1;
	}
	const accountId = map.get("account") ?? "";
	const businessName = map.get("business") ?? "";
	const businessType = map.get("type") ?? "";
	const ownerEmail = map.get("owner-email") ?? "";
	const databaseUrl = (map.get("database-url") ?? "").trim();
	if (accountId.length === 0) return { ok: false, message: "Pass --account." };
	if (businessName.length === 0) return { ok: false, message: "Pass --business." };
	if (businessType !== "restaurant" && businessType !== "grocer") {
		return { ok: false, message: "Pass --type restaurant or grocer." };
	}
	if (!ownerEmail.includes("@")) return { ok: false, message: "Pass --owner-email." };
	if (databaseUrl.length === 0) return { ok: false, message: "Pass --database-url." };
	return {
		ok: true,
		databaseUrl,
		input: { accountId, businessName, businessType, ownerEmail },
	};
}

export function productionConnection(envText, parentEnv) {
	const fromFile = parseEnv(envText).get("NEON_POSTGRES_CONNECTION_STRING");
	const fromParent = parentEnv?.NEON_POSTGRES_CONNECTION_STRING;
	const value = [fromParent, fromFile].find((item) => typeof item === "string" && item.trim().length > 0);
	return typeof value === "string" ? value.trim() : "";
}

function databaseIdentity(url) {
	try {
		const parsed = new URL(url);
		const host = parsed.hostname.replace(/-pooler(?=\.)/, "");
		return `${host}${parsed.pathname.replace(/\/+$/, "")}`;
	} catch {
		return url.trim().replace(/\/+$/, "");
	}
}

export function refuseProductionDatabase({ databaseUrl, productionUrl, databaseEnv }) {
	const production = productionUrl?.trim() ?? "";
	if (production.length === 0) {
		return { ok: false, message: "NEON_POSTGRES_CONNECTION_STRING is absent." };
	}
	if (databaseIdentity(databaseUrl) === databaseIdentity(production)) {
		return { ok: false, message: "Refusing to write. The database URL is the production database." };
	}
	const fromEnv = databaseEnv?.trim() ?? "";
	if (fromEnv.length > 0 && databaseIdentity(fromEnv) === databaseIdentity(production)) {
		return { ok: false, message: "Refusing to write. DATABASE_URL is the production database." };
	}
	return { ok: true };
}

function stop(message) {
	console.error(message);
	return 1;
}

export async function runRealBootstrap(options) {
	const parsed = parseRealBootstrapArgs(options.argv ?? []);
	if (!parsed.ok) return stop(parsed.message);
	const productionUrl = productionConnection(options.envText ?? "", options.parentEnv ?? {});
	const decision = refuseProductionDatabase({
		databaseUrl: parsed.databaseUrl,
		productionUrl,
		databaseEnv: options.parentEnv?.DATABASE_URL,
	});
	if (!decision.ok) return stop(decision.message);
	let opened;
	try {
		opened = await options.open(parsed.databaseUrl);
	} catch {
		return stop(migrationFailed);
	}
	let migrated = false;
	try {
		await opened.migrate();
		migrated = true;
		const bootstrap =
			options.bootstrap ?? (await import("../packages/seed/src/real-bootstrap.ts")).bootstrapRealAccount;
		await bootstrap(opened.db, { ...parsed.input, now: options.now ?? new Date() });
	} catch {
		return stop(migrated ? bootstrapFailed : migrationFailed);
	} finally {
		await opened.close();
	}
	console.log(`account ${parsed.input.accountId}`);
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

async function openReal(url) {
	const { openPostgres } = await import("../packages/adapters/src/neon/postgres.ts");
	const opened = openPostgres(url);
	return {
		db: opened.db,
		migrate: () => opened.migrate(),
		close: () => opened.close(),
	};
}

if (isDirectRun()) {
	process.exit(
		await runRealBootstrap({
			argv: process.argv.slice(2),
			envText: readEnvFile(),
			parentEnv: process.env,
			open: openReal,
		}),
	);
}
