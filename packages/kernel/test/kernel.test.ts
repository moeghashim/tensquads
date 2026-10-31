import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { DECIDER_MISSING, Kernel } from "../src/index.ts";

const PLUGIN_NAMES = ["platform", "squads", "bus", "policy", "catalog", "conversation"];

test("the kernel loads the six empty plug-ins", () => {
	const kernel = new Kernel();
	assert.deepEqual([...kernel.pluginNames()].sort(), [...PLUGIN_NAMES].sort());
	assert.equal(kernel.machine, null);
	assert.equal(kernel.bus, null);
	assert.equal(kernel.gateway, null);
	assert.equal(kernel.repositories, null);
});

test("the decider has no adapter in version 1", () => {
	const kernel = new Kernel();
	assert.throws(() => kernel.decider.decide({}), { message: DECIDER_MISSING });
});

test("only kernel.ts imports cordis", () => {
	const root = join(import.meta.dirname, "..", "..", "..");
	const hits: string[] = [];
	walk(root, hits);
	assert.deepEqual(hits, ["packages/kernel/src/kernel.ts"]);
});

function walk(dir: string, hits: string[]): void {
	const skip = new Set(["node_modules", "dist", ".git", ".wrangler", "design"]);
	for (const name of readdirSync(dir)) {
		if (skip.has(name)) {
			continue;
		}
		const path = join(dir, name);
		const stat = statSync(path);
		if (stat.isDirectory()) {
			walk(path, hits);
			continue;
		}
		if (!name.endsWith(".ts") && !name.endsWith(".tsx") && !name.endsWith(".mjs") && !name.endsWith(".js")) {
			continue;
		}
		const text = readFileSync(path, "utf8");
		if (/\bfrom\s+["']cordis["']|\brequire\(\s*["']cordis["']\s*\)/.test(text)) {
			hits.push(path.slice(path.indexOf("packages/")));
		}
	}
}
