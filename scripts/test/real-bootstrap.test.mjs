import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
	parseRealBootstrapArgs,
	productionConnection,
	refuseProductionDatabase,
	runRealBootstrap,
} from "../real-bootstrap.mjs";

const production = "postgres://role:secret@ep-live.example/neondb";
const branch = "postgres://role:secret@ep-real.example/neondb";
const args = [
	"--account",
	"noon",
	"--business",
	"Noon Kitchen",
	"--type",
	"restaurant",
	"--owner-email",
	"owner@example.com",
];
const clerkFlag = ["--owner-clerk-user-id", "user_Owner1"];
const readyArgs = [...args, ...clerkFlag, "--database-url", branch];

function capture(run) {
	const errors = [];
	const logs = [];
	const originalError = console.error;
	const originalLog = console.log;
	console.error = (message) => {
		errors.push(message);
	};
	console.log = (message) => {
		logs.push(message);
	};
	return run()
		.then((code) => ({ code, errors, logs }))
		.finally(() => {
			console.error = originalError;
			console.log = originalLog;
		});
}

test("real bootstrap requires an explicit database url and refuses the production database", async () => {
	const source = readFileSync(
		fileURLToPath(new URL("../../packages/seed/src/real-bootstrap.ts", import.meta.url)),
		"utf8",
	);
	assert.equal(source.includes("saveWorkspace"), false);
	assert.equal(source.includes("writeAccount"), false);
	assert.equal(source.includes('REAL_BUSINESS_KEY = "state:business"'), true);
	const request = readFileSync(
		fileURLToPath(new URL("../../packages/adapters/src/cloudflare-bus/account-request.ts", import.meta.url)),
		"utf8",
	);
	assert.equal(request.includes('export const BUSINESS_KEY = "state:business"'), true);

	assert.equal(parseRealBootstrapArgs(args).ok, false);
	assert.equal(parseRealBootstrapArgs([...args, "--database-url", branch]).ok, false);
	assert.equal(
		parseRealBootstrapArgs([...args, "--owner-clerk-user-id", "not_a_user", "--database-url", branch]).ok,
		false,
	);
	assert.equal(parseRealBootstrapArgs(readyArgs).ok, true);
	assert.equal(parseRealBootstrapArgs([...readyArgs, "--type", "cafe"]).ok, false);

	const envText = `NEON_POSTGRES_CONNECTION_STRING="${production}"\n`;
	assert.equal(productionConnection(envText, {}), production);
	assert.equal(productionConnection(envText, { NEON_POSTGRES_CONNECTION_STRING: branch }), branch);
	assert.equal(refuseProductionDatabase({ databaseUrl: branch, productionUrl: production, databaseEnv: "" }).ok, true);
	assert.equal(
		refuseProductionDatabase({ databaseUrl: `${production}/`, productionUrl: production, databaseEnv: "" }).ok,
		false,
	);
	assert.equal(
		refuseProductionDatabase({
			databaseUrl: "postgres://role:secret@ep-live-pooler.example/neondb",
			productionUrl: production,
			databaseEnv: "",
		}).ok,
		false,
	);

	let opened = false;
	const refused = await capture(() =>
		runRealBootstrap({
			argv: [...args, ...clerkFlag, "--database-url", production],
			envText,
			parentEnv: {},
			async open() {
				opened = true;
				throw new Error(production);
			},
		}),
	);
	assert.equal(refused.code, 1);
	assert.equal(opened, false);
	assert.equal(refused.errors.join("\n").includes(production), false);
	assert.equal(refused.errors.join("\n").includes("secret"), false);
	assert.deepEqual(refused.errors, ["Refusing to write. The database URL is the production database."]);

	const envRefused = await capture(() =>
		runRealBootstrap({
			argv: [...args, ...clerkFlag, "--database-url", branch],
			envText,
			parentEnv: { DATABASE_URL: production },
			async open() {
				opened = true;
				throw new Error(production);
			},
		}),
	);
	assert.equal(envRefused.code, 1);
	assert.equal(opened, false);
	assert.deepEqual(envRefused.errors, ["Refusing to write. DATABASE_URL is the production database."]);

	const missing = await capture(() =>
		runRealBootstrap({
			argv: [...args, ...clerkFlag, "--database-url", branch],
			envText: "",
			parentEnv: {},
			async open() {
				opened = true;
				throw new Error("opened");
			},
		}),
	);
	assert.equal(missing.code, 1);
	assert.equal(opened, false);
	assert.deepEqual(missing.errors, ["NEON_POSTGRES_CONNECTION_STRING is absent."]);
});

test("real bootstrap migrates the explicit database and does not open production", async () => {
	const seen = [];
	const result = await capture(() =>
		runRealBootstrap({
			argv: [...readyArgs, "--type", "grocer"],
			envText: `NEON_POSTGRES_CONNECTION_STRING="${production}"\n`,
			parentEnv: { DATABASE_URL: branch },
			now: new Date("2026-11-06T00:00:00.000Z"),
			async open(url) {
				seen.push(url);
				return {
					db: { marker: "pglite" },
					async migrate() {
						seen.push("migrate");
					},
					async close() {
						seen.push("close");
					},
				};
			},
			async bootstrap(_db, input) {
				seen.push(input.businessType);
				seen.push(input.ownerEmail);
				seen.push(input.ownerClerkUserId);
			},
		}),
	);
	assert.equal(result.code, 0);
	assert.deepEqual(seen, [branch, "migrate", "grocer", "owner@example.com", "user_Owner1", "close"]);
	assert.equal(seen.includes(production), false);
	assert.equal(result.logs.join("\n").includes(branch), false);
	assert.equal(result.errors.join("\n").includes("secret"), false);
});

test("real bootstrap reports an existing account", async () => {
	const error = new Error("The account noon already exists.");
	error.code = "account_exists";
	const result = await capture(() =>
		runRealBootstrap({
			argv: readyArgs,
			envText: `NEON_POSTGRES_CONNECTION_STRING="${production}"\n`,
			parentEnv: {},
			async open() {
				return {
					db: {},
					async migrate() {},
					async close() {},
				};
			},
			async bootstrap() {
				throw error;
			},
		}),
	);
	assert.equal(result.code, 1);
	assert.deepEqual(result.errors, ["The account noon already exists."]);
	assert.equal(result.errors.join("\n").includes(production), false);
	assert.equal(result.errors.join("\n").includes("secret"), false);
});

test("real bootstrap refuses a disguised production database url", async () => {
	const envText = `NEON_POSTGRES_CONNECTION_STRING="${production}"\n`;
	const liveHost = "postgres://role:secret@ep-live.region.aws.neon.tech/neondb";
	const disguised = [
		"postgres://role:secret@ep-live.example/%6eeondb",
		"postgres://role:secret@ep-other.example/neondb?host=ep-live.example",
		"postgres://role:secret@ep-other.example/otherdb?host=ep-live.example",
		"postgres://role:secret@ep-other.example/otherdb?hostaddr=10.0.0.1",
		"postgres://role:secret@ep-other.example/otherdb?service=prod",
		"postgres://role:secret@ep-%6cive.example/neondb",
		"postgres://role:secret@ep-other.example/otherdb?%68ost=ep-live.example",
		"postgres://role:secret@ep-live.example/%256eeondb",
		"postgres://other:secret@ep-live.example/neondb",
		"postgres://role:p%40ss@ep-live.example/neondb",
		"postgres://role:secret@ep-live-pooler.example/neondb",
		`${production}/`,
		"postgresql://role:secret@ep-live.example:5432/neondb",
		"postgres://role:secret@EP-LIVE.example/neondb",
		`${production}?sslmode=require`,
		"postgres://role:secret@ep-live-pooler.other.example/neondb",
	];
	for (const url of disguised) {
		const decision = refuseProductionDatabase({ databaseUrl: url, productionUrl: production, databaseEnv: "" });
		assert.equal(decision.ok, false, url);
		assert.equal(decision.message.includes(url), false, url);
		assert.equal(decision.message.includes("secret"), false, url);
		let opened = false;
		const refused = await capture(() =>
			runRealBootstrap({
				argv: [...args, ...clerkFlag, "--database-url", url],
				envText,
				parentEnv: {},
				async open() {
					opened = true;
					throw new Error("opened");
				},
			}),
		);
		assert.equal(opened, false, url);
		assert.equal(refused.code, 1, url);
		assert.equal(refused.errors.join("\n").includes(url), false, url);
		assert.equal(refused.errors.join("\n").includes("secret"), false, url);
	}
	const endpoint = refuseProductionDatabase({
		databaseUrl: "postgres://role:secret@ep-live-pooler.other.example/neondb",
		productionUrl: liveHost,
		databaseEnv: "",
	});
	assert.equal(endpoint.ok, false);
	assert.equal(endpoint.message, "Refusing to write. The database URL is the production database.");
	const databaseEnv = refuseProductionDatabase({
		databaseUrl: branch,
		productionUrl: production,
		databaseEnv: "postgres://role:secret@ep-live-pooler.example/neondb",
	});
	assert.equal(databaseEnv.ok, false);
	assert.equal(databaseEnv.message, "Refusing to write. DATABASE_URL is the production database.");
	const unsafeEnv = refuseProductionDatabase({
		databaseUrl: branch,
		productionUrl: production,
		databaseEnv: "postgres://role:secret@ep-real.example/neondb?hostaddr=10.0.0.1",
	});
	assert.equal(unsafeEnv.ok, false);
	assert.equal(unsafeEnv.message, "Refusing to write. DATABASE_URL is not a plain connection string.");
	const unsafeProduction = refuseProductionDatabase({
		databaseUrl: branch,
		productionUrl: "postgres://role:secret@ep-live.example/%6eeondb",
		databaseEnv: "",
	});
	assert.equal(unsafeProduction.ok, false);
	assert.equal(
		unsafeProduction.message,
		"Refusing to write. The production database URL is not a plain connection string.",
	);
	const allowed = [
		branch,
		`${branch}?sslmode=require`,
		"postgres://role:p%40ss@ep-real.example/neondb",
		"postgres://role:secret@ep-live.example/otherdb",
		"postgres://role:secret@ep-real.example/neondb?options=-csearch_path%3Dpublic",
		"postgres://role:secret@ep-live.example/Neondb",
	];
	for (const url of allowed) {
		assert.equal(
			refuseProductionDatabase({ databaseUrl: url, productionUrl: production, databaseEnv: "" }).ok,
			true,
			url,
		);
	}
});
