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

test("Dependabot prints one exact sentence for every missing secret", async (context) => {
	const { secretsFor, test: playwrightTest } = await import("../../e2e/support.ts");
	for (const name of [
		"CLERK_PUBLISHABLE_KEY",
		"VITE_CLERK_PUBLISHABLE_KEY",
		"CLERK_SECRET_KEY",
		"TEST_DATABASE_URL",
	]) {
		const saved = process.env[name];
		delete process.env[name];
		context.after(() => restore(name, saved));
	}
	for (const [name, value] of [
		["GITHUB_ACTIONS", "true"],
		["GITHUB_ACTOR", "dependabot[bot]"],
	]) {
		const saved = process.env[name];
		process.env[name] = value;
		context.after(() => restore(name, saved));
	}
	const lines = [];
	context.mock.method(console, "log", (line) => lines.push(line));
	const skip = context.mock.method(playwrightTest, "skip", () => {});
	secretsFor(["publishable", "secret", "testDatabase"]);
	assert.deepEqual(lines, [
		"CLERK_PUBLISHABLE_KEY was skipped. A Dependabot pull request gets no secrets.",
		"CLERK_SECRET_KEY was skipped. A Dependabot pull request gets no secrets.",
		"TEST_DATABASE_URL was skipped. A Dependabot pull request gets no secrets.",
	]);
	assert.equal(skip.mock.callCount(), 1);
});
