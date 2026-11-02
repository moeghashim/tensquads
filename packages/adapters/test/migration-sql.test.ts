import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { migrationSql } from "../src/neon/migration-sql.ts";

test("the bundled migration text matches migration.sql", () => {
	const file = readFileSync(new URL("../src/neon/migration.sql", import.meta.url), "utf8");
	assert.equal(migrationSql, file);
});
