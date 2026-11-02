import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { migrationSql } from "../src/neon/migration-sql.ts";
import { migrationStatements } from "../src/neon/postgres.ts";

test("the bundled migration text matches migration.sql", () => {
	const file = readFileSync(new URL("../src/neon/migration.sql", import.meta.url), "utf8");
	assert.equal(migrationSql, file);
});

test("the Mandate function stays one migration statement", () => {
	const statements = migrationStatements(migrationSql);
	const body = statements.filter((statement) => statement.includes("RETURN OLD"));
	assert.equal(body.length, 1);
	assert.match(body[0] ?? "", /CREATE OR REPLACE FUNCTION mandates_never_change/);
	assert.match(body[0] ?? "", /A Mandate never changes/);
	assert.equal(
		statements.some((statement) => statement.trim() === "RETURN OLD"),
		false,
	);
});
