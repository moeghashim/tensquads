import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { MissingAccountScopeError, requireScope } from "../src/index.ts";

test("a call without a scope is rejected", () => {
	assert.throws(() => requireScope(undefined), MissingAccountScopeError);
	assert.throws(() => requireScope({ accountId: "", mode: "account" }), MissingAccountScopeError);
});

test("account and platform scopes pass", () => {
	assert.equal(requireScope({ accountId: "demo", mode: "account" }).mode, "account");
	assert.equal(requireScope({ accountId: "platform", mode: "platform" }).mode, "platform");
});

test("the domain package imports no database and no cordis", () => {
	const root = join(import.meta.dirname, "..", "src");
	const hits: string[] = [];
	walk(root, hits);
	assert.deepEqual(hits, []);
});

function walk(dir: string, hits: string[]): void {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) {
			walk(path, hits);
			continue;
		}
		if (!name.endsWith(".ts")) {
			continue;
		}
		const text = readFileSync(path, "utf8");
		if (/\bfrom\s+["'](cordis|drizzle-orm|@electric-sql\/pglite|postgres)["']/.test(text)) {
			hits.push(path);
		}
	}
}
