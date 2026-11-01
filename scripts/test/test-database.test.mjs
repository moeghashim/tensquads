import assert from "node:assert/strict";
import test from "node:test";

import { localSecrets } from "../write-dev-vars.mjs";

test("TEST_DATABASE_URL does not fall back to the Neon connection", async () => {
	const savedTest = process.env.TEST_DATABASE_URL;
	const savedNeon = process.env.NEON_POSTGRES_CONNECTION_STRING;
	const savedActions = process.env.GITHUB_ACTIONS;
	const savedActor = process.env.GITHUB_ACTOR;
	delete process.env.TEST_DATABASE_URL;
	delete process.env.GITHUB_ACTIONS;
	delete process.env.GITHUB_ACTOR;
	process.env.NEON_POSTGRES_CONNECTION_STRING = "postgres://normal-neon.example/db";
	try {
		const secrets = localSecrets();
		assert.equal(secrets.neon, "postgres://normal-neon.example/db");
		assert.equal(secrets.testDatabase, "");
		const { secretsFor } = await import("../../e2e/support.ts");
		assert.throws(() => secretsFor(["testDatabase"]), /testDatabase is missing\./);
	} finally {
		restore("TEST_DATABASE_URL", savedTest);
		restore("NEON_POSTGRES_CONNECTION_STRING", savedNeon);
		restore("GITHUB_ACTIONS", savedActions);
		restore("GITHUB_ACTOR", savedActor);
	}
});

function restore(name, value) {
	if (value === undefined) {
		delete process.env[name];
		return;
	}
	process.env[name] = value;
}
