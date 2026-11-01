import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { build } from "esbuild";

const compiled = await build({
	entryPoints: ["e2e/session.spec.ts"],
	format: "cjs",
	platform: "node",
	write: false,
});
const nodeRequire = createRequire(import.meta.url);
const ready = new Error("Ready for browser");
const migrationFailure = new Error("Migration failed");

function sessionCaller(failMigration) {
	const cases = new Map();
	const events = [];
	const support = {
		test: (name, callback) => cases.set(name, callback),
		secretsFor: () => ({ testDatabase: "postgres://test" }),
		watchPageErrors: () => {
			throw ready;
		},
	};
	const adapters = {
		openPostgres(connection) {
			events.push(["open", connection]);
			return {
				async migrate() {
					events.push(["migrate"]);
					if (failMigration) throw migrationFailure;
				},
				async close() {
					events.push(["close"]);
				},
			};
		},
	};
	const boundaries = new Map([
		["./support.ts", support],
		["./workspace.ts", { deleteWorkspaceAccount: async () => {} }],
		["@tensquads/adapters", adapters],
		["@neondatabase/serverless", { neon: () => ({ query: async () => assert.fail("HTTP migration bypass") }) }],
	]);
	const require = (specifier) => boundaries.get(specifier) ?? nodeRequire(specifier);
	const module = { exports: {} };
	new Function("require", "module", "exports", compiled.outputFiles[0].text)(require, module, module.exports);
	return { run: cases.get("a new user makes one account and reaches overview"), events };
}

test("signup test calls the Postgres migrator and closes it before browser work", async () => {
	const caller = sessionCaller(false);
	await assert.rejects(caller.run({ page: {} }), (error) => error === ready);
	assert.deepEqual(caller.events, [["open", "postgres://test"], ["migrate"], ["close"]]);
});

test("signup test closes the Postgres migrator when migration fails", async () => {
	const caller = sessionCaller(true);
	await assert.rejects(caller.run({ page: {} }), (error) => error === migrationFailure);
	assert.deepEqual(caller.events, [["open", "postgres://test"], ["migrate"], ["close"]]);
});
