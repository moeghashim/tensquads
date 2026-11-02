import assert from "node:assert/strict";
import test from "node:test";

import {
	buildDatabaseName,
	createPrivateDatabase,
	directUrl,
	dropPrivateDatabase,
	refuseDrop,
	refuseNeon,
} from "../ci-test-database.mjs";

const source = "postgres://role:pw@ep-test-pooler.example/testdb?sslmode=require";

function env(overrides = {}) {
	return {
		TEST_DATABASE_URL: source,
		GITHUB_RUN_ID: "41431113192",
		GITHUB_RUN_ATTEMPT: "1",
		RUNNER_OS: "macOS",
		...overrides,
	};
}

test("the database name uses the run, the attempt, and the OS", () => {
	assert.equal(buildDatabaseName({ runId: "41431113192", attempt: "2", os: "macOS" }), "ci_41431113192_2_macos");
	assert.equal(buildDatabaseName({ runId: "9", attempt: "1", os: "ubuntu-latest" }), "ci_9_1_ubuntu_latest");
	assert.equal(buildDatabaseName({ runId: "9", attempt: "1", os: "Linux" }), "ci_9_1_linux");
});

test("the database name rejects a missing part", () => {
	assert.throws(() => buildDatabaseName({ runId: "9", attempt: "1", os: "" }), /run id, an attempt, and an OS/);
});

test("the admin host drops the pooler label", () => {
	const direct = new URL(directUrl(source));
	assert.equal(direct.hostname, "ep-test.example");
	assert.equal(direct.pathname, "/testdb");
	assert.equal(direct.search, "?sslmode=require");
	assert.equal(direct.password, "pw");
});

test("create uses the non-pooled host and writes only the new database URL", async () => {
	const calls = [];
	let written = "";
	const masks = [];
	const name = await createPrivateDatabase({
		env: env(),
		query: async (connection, sql) => {
			calls.push({ host: new URL(connection).hostname, database: new URL(connection).pathname, sql });
		},
		mask: (value) => masks.push(value),
		writeEnv: (url) => {
			written = url;
		},
	});
	assert.equal(name, "ci_41431113192_1_macos");
	assert.equal(calls.length, 1);
	assert.equal(calls[0].host, "ep-test.example");
	assert.equal(calls[0].database, "/testdb");
	assert.equal(calls[0].sql, 'CREATE DATABASE "ci_41431113192_1_macos"');
	const created = new URL(written);
	assert.equal(created.hostname, "ep-test.example");
	assert.equal(created.pathname, "/ci_41431113192_1_macos");
	assert.equal(masks.includes(written), true);
	assert.equal(masks.includes("pw"), true);
});

test("create and drop refuse the Neon database and do not connect", async () => {
	const calls = [];
	const query = async () => {
		calls.push("query");
	};
	const neon = "postgres://role:pw@prod.example/neondb";
	const sameDatabase = env({
		TEST_DATABASE_URL: "postgres://role:pw@ep-test-pooler.example/neondb",
		NEON_POSTGRES_CONNECTION_STRING: neon,
	});
	await assert.rejects(
		() => createPrivateDatabase({ env: sameDatabase, query, mask: () => undefined, writeEnv: () => undefined }),
		/refusing the Neon connection/,
	);
	const unnamedProduction = env({
		TEST_DATABASE_URL: "postgres://role:pw@ep-test-pooler.example/neondb",
		NEON_POSTGRES_CONNECTION_STRING: "",
	});
	await assert.rejects(
		() => createPrivateDatabase({ env: unnamedProduction, query, mask: () => undefined, writeEnv: () => undefined }),
		/refusing the Neon connection/,
	);
	const built = buildDatabaseName({ runId: "12", attempt: "1", os: "Linux" });
	const namedLikeNeon = env({
		GITHUB_RUN_ID: "12",
		GITHUB_RUN_ATTEMPT: "1",
		RUNNER_OS: "Linux",
		NEON_POSTGRES_CONNECTION_STRING: `postgres://role:pw@prod.example/${built}`,
	});
	await assert.rejects(
		() => dropPrivateDatabase({ env: namedLikeNeon, query, mask: () => undefined }),
		/refusing the Neon connection/,
	);
	assert.equal(calls.length, 0);
	assert.throws(
		() => refuseNeon({ name: "ci_1_1_linux", sourceUrl: source, neonUrl: neon.replace("neondb", "testdb") }),
		/refusing the Neon connection/,
	);
});

for (const [label, sourcePath, neonPath, error] of [
	["encoded neondb without a Neon URL", "%6eeondb", "", /refusing the Neon connection/],
	["encoded neondb with a Neon URL", "%6eeondb", "neondb", /refusing the Neon connection/],
	["encoded protected source", "%70rotected", "protected", /refusing the Neon connection/],
	["encoded Neon source", "protected", "%70rotected", /refusing the Neon connection/],
	["encoded Neon private name", "testdb", "%63i_41431113192_1_macos", /refusing the Neon connection/],
	["invalid source encoding", "%ZZ", "", /not valid/],
	["invalid Neon encoding", "testdb", "%ZZ", /not valid/],
]) {
	for (const operation of [createPrivateDatabase, dropPrivateDatabase]) {
		test(`${operation.name} refuses ${label} before query`, async () => {
			let queries = 0;
			await assert.rejects(
				() =>
					operation({
						env: env({
							TEST_DATABASE_URL: `postgres://role@database.invalid/${sourcePath}`,
							NEON_POSTGRES_CONNECTION_STRING: neonPath ? `postgres://role@database.invalid/${neonPath}` : "",
						}),
						query: async () => {
							queries += 1;
						},
						mask: () => undefined,
						writeEnv: () => undefined,
					}),
				error,
			);
			assert.equal(queries, 0);
		});
	}
}

test("the guard decodes private names before production comparisons", () => {
	for (const [name, neonUrl] of [
		["%6eeondb", ""],
		["%63i_protected", "postgres://role@database.invalid/ci_protected"],
	]) {
		assert.throws(
			() => refuseNeon({ name, sourceUrl: "postgres://role@database.invalid/testdb", neonUrl }),
			/refusing the Neon connection/,
		);
	}
	assert.throws(
		() => refuseNeon({ name: "%ZZ", sourceUrl: "postgres://role@database.invalid/testdb", neonUrl: "" }),
		/not valid/,
	);
});

test("drop refuses every name outside the ci_ prefix", () => {
	for (const name of ["neondb", "postgres", "testdb", "CI_1_1_linux", "ci-1", ""]) {
		assert.throws(() => refuseDrop(name), /outside the ci_ prefix/);
	}
	assert.equal(refuseDrop("ci_1_1_linux"), undefined);
});

test("drop removes only the database this job created", async () => {
	const calls = [];
	const name = await dropPrivateDatabase({
		env: env({ NEON_POSTGRES_CONNECTION_STRING: "postgres://role:pw@prod.example/neondb" }),
		query: async (connection, sql) => {
			calls.push({ host: new URL(connection).hostname, database: new URL(connection).pathname, sql });
		},
		mask: () => undefined,
	});
	assert.equal(name, "ci_41431113192_1_macos");
	assert.deepEqual(calls, [
		{
			host: "ep-test.example",
			database: "/testdb",
			sql: 'DROP DATABASE IF EXISTS "ci_41431113192_1_macos" WITH (FORCE)',
		},
	]);
});

test("a missing secret fails, and Dependabot skips without a connection", async () => {
	const calls = [];
	const query = async () => {
		calls.push("query");
	};
	await assert.rejects(
		() =>
			createPrivateDatabase({
				env: env({ TEST_DATABASE_URL: "" }),
				query,
				mask: () => undefined,
				writeEnv: () => undefined,
			}),
		/TEST_DATABASE_URL is missing/,
	);
	const skipped = await dropPrivateDatabase({
		env: env({
			TEST_DATABASE_URL: "",
			GITHUB_ACTIONS: "true",
			GITHUB_ACTOR: "dependabot[bot]",
		}),
		query,
		mask: () => undefined,
	});
	assert.equal(skipped, "skip");
	assert.equal(calls.length, 0);
});
