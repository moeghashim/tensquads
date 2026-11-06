import { fileURLToPath } from "node:url";

import { namedConnection, readDotEnv, runAsCli } from "./cli-env.mjs";
import { connectionIdentity, sameDatabaseTarget } from "./database-identity.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

const migrationFailed = "The real database migration did not finish.";
const bootstrapFailed = "The real account bootstrap did not finish.";
const plainTarget = "Refusing to write. The database URL is not a plain connection string.";
const plainProduction = "Refusing to write. The production database URL is not a plain connection string.";
const plainDatabaseEnv = "Refusing to write. DATABASE_URL is not a plain connection string.";
const productionDatabase = "Refusing to write. The database URL is the production database.";
const productionDatabaseEnv = "Refusing to write. DATABASE_URL is the production database.";
const clerkUserIdPattern = /^user_[A-Za-z0-9]+$/;

function readFlags(argv) {
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
	return { ok: true, map };
}

function flagValue(map, key) {
	return (map.get(key) ?? "").trim();
}

function invalidBootstrap(input) {
	if (input.accountId.length === 0) return { ok: false, message: "Pass --account." };
	if (input.businessName.length === 0) return { ok: false, message: "Pass --business." };
	if (input.businessType !== "restaurant" && input.businessType !== "grocer") {
		return { ok: false, message: "Pass --type restaurant or grocer." };
	}
	if (!input.ownerEmail.includes("@")) return { ok: false, message: "Pass --owner-email." };
	if (input.ownerClerkUserId.length === 0) return { ok: false, message: "Pass --owner-clerk-user-id." };
	if (!clerkUserIdPattern.test(input.ownerClerkUserId)) {
		return { ok: false, message: "The owner Clerk user id is not valid." };
	}
	if (input.databaseUrl.length === 0) return { ok: false, message: "Pass --database-url." };
	return undefined;
}

export function parseRealBootstrapArgs(argv) {
	const flags = readFlags(argv);
	if (!flags.ok) return flags;
	const input = {
		accountId: flagValue(flags.map, "account"),
		businessName: flagValue(flags.map, "business"),
		businessType: flagValue(flags.map, "type"),
		ownerEmail: flagValue(flags.map, "owner-email"),
		ownerClerkUserId: flagValue(flags.map, "owner-clerk-user-id"),
		databaseUrl: flagValue(flags.map, "database-url"),
	};
	const invalid = invalidBootstrap(input);
	if (invalid) return invalid;
	return {
		ok: true,
		databaseUrl: input.databaseUrl,
		input: {
			accountId: input.accountId,
			businessName: input.businessName,
			businessType: input.businessType,
			ownerEmail: input.ownerEmail,
			ownerClerkUserId: input.ownerClerkUserId,
		},
	};
}

export function productionConnection(envText, parentEnv) {
	return namedConnection(envText, parentEnv, "NEON_POSTGRES_CONNECTION_STRING") ?? "";
}

export function refuseProductionDatabase({ databaseUrl, productionUrl, databaseEnv }) {
	const production = productionUrl?.trim() ?? "";
	if (production.length === 0) return { ok: false, message: "NEON_POSTGRES_CONNECTION_STRING is absent." };
	const live = connectionIdentity(production);
	if (!live) return { ok: false, message: plainProduction };
	const target = connectionIdentity(databaseUrl);
	if (!target) return { ok: false, message: plainTarget };
	if (sameDatabaseTarget(target, live)) return { ok: false, message: productionDatabase };
	return databaseEnvDecision(databaseEnv, live);
}

function databaseEnvDecision(databaseEnv, live) {
	const fromEnv = databaseEnv?.trim() ?? "";
	if (fromEnv.length === 0) return { ok: true };
	const identity = connectionIdentity(fromEnv);
	if (!identity) return { ok: false, message: plainDatabaseEnv };
	if (sameDatabaseTarget(identity, live)) return { ok: false, message: productionDatabaseEnv };
	return { ok: true };
}

function stop(message) {
	console.error(message);
	return 1;
}

function existingAccountMessage(error) {
	if (error?.code !== "account_exists" || typeof error.message !== "string") return undefined;
	if (!/^The account \S+ already exists\.$/.test(error.message)) return undefined;
	return error.message;
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
	} catch (error) {
		const existing = existingAccountMessage(error);
		if (migrated && existing) return stop(existing);
		return stop(migrated ? bootstrapFailed : migrationFailed);
	} finally {
		await opened.close();
	}
	console.log(`account ${parsed.input.accountId}`);
	return 0;
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

await runAsCli(import.meta.url, () =>
	runRealBootstrap({
		argv: process.argv.slice(2),
		envText: readDotEnv(root),
		parentEnv: process.env,
		open: openReal,
	}),
);
