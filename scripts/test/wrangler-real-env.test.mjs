import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const wranglerPath = join(root, "apps/web/wrangler.jsonc");
const productionQueues = ["tensquads-bus", "tensquads-bus-dlq"];
const realQueues = ["tensquads-real-bus", "tensquads-real-bus-dlq"];
const orgId = "org_3Lazia1HC1hdgfY0mAttb1qTWYm";

// Worker secrets and dev-only connection strings. The real Worker reads them, and they stay out of wrangler.jsonc.
const secrets = new Set([
	"BOAT_ADMIN_TOKEN",
	"BOAT_BASE_PATH",
	"BOAT_PROFILE",
	"BOAT_SECRET_BASE_URL",
	"BOAT_TOKEN",
	"CLERK_PUBLISHABLE_KEY",
	"CLERK_SECRET_KEY",
	"CONTEXT_WEBHOOK_SECRET",
	"DATABASE_URL",
	"MACHINE_TOKEN_KEY",
	"NEON_POSTGRES_CONNECTION_STRING",
	"OPENAI_API_KEY",
	"TEST_DATABASE_URL",
	"VITE_CLERK_PUBLISHABLE_KEY",
]);

// Optional debug flag. The real path does not require it.
const optional = new Set(["BUS_INSPECT"]);

const configBindings = new Set([
	"ACCOUNT_BUS",
	"ADAPTERS",
	"BROWSER",
	"BUS_DEAD_LETTER",
	"BUS_QUEUE",
	"CLERK_PLATFORM_ORG_ID",
	"MASTER_MODEL",
	"MASTER_REASONING_EFFORT",
]);

function parseWrangler(text) {
	return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
}

function sourceFiles(directory, found = []) {
	for (const name of readdirSync(directory)) {
		if (name.endsWith(".test.ts") || name.endsWith(".test.mjs")) continue;
		const path = join(directory, name);
		if (statSync(path).isDirectory()) sourceFiles(path, found);
		else if (name.endsWith(".ts")) found.push(path);
	}
	return found;
}

function bindingNames(text) {
	const names = new Set();
	for (const match of text.matchAll(/(?<!import\.meta\.|process\.)\benv\.([A-Z][A-Z0-9_]*)\b/g)) names.add(match[1]);
	for (const match of text.matchAll(/\bworkerEnv\(\s*"([A-Z][A-Z0-9_]*)"\s*\)/g)) names.add(match[1]);
	for (const match of text.matchAll(/\breadonly\s+([A-Z][A-Z0-9_]*)\??:/g)) names.add(match[1]);
	return names;
}

function workerBindingNames() {
	const files = [
		...sourceFiles(join(root, "packages/adapters/src/cloudflare-bus")),
		join(root, "packages/adapters/src/adapters-flag.ts"),
		...sourceFiles(join(root, "apps/web/src")),
	];
	const names = new Set();
	for (const file of files) {
		for (const name of bindingNames(readFileSync(file, "utf8"))) names.add(name);
	}
	return names;
}

function queueNames(section) {
	const names = new Set();
	for (const producer of section.queues?.producers ?? []) names.add(producer.queue);
	for (const consumer of section.queues?.consumers ?? []) {
		names.add(consumer.queue);
		if (consumer.dead_letter_queue) names.add(consumer.dead_letter_queue);
	}
	if (typeof section.vars?.BUS_DEAD_LETTER === "string") names.add(section.vars.BUS_DEAD_LETTER);
	return names;
}

function keysNamed(value, found = []) {
	if (!value || typeof value !== "object") return found;
	if (Array.isArray(value)) {
		for (const item of value) keysNamed(item, found);
		return found;
	}
	for (const [key, child] of Object.entries(value)) {
		found.push(key);
		keysNamed(child, found);
	}
	return found;
}

test("env.real declares every binding the real Worker reads and shares no queue with production", () => {
	const text = readFileSync(wranglerPath, "utf8");
	const config = parseWrangler(text);
	const real = config.env.real;
	const read = workerBindingNames();

	assert.deepEqual(
		[...read].filter((name) => !configBindings.has(name) && !secrets.has(name) && !optional.has(name)),
		[],
	);
	for (const name of configBindings) assert.equal(read.has(name), true, name);

	assert.equal(config.name, "tensquads");
	assert.equal(config.account_id, "678c5a795f40f7e9f33b8a71248cc829");
	assert.equal(config.main, "src/worker.ts");
	assert.equal(config.compatibility_date, "2026-10-23");
	assert.deepEqual(config.compatibility_flags, ["nodejs_compat", "nodejs_compat_populate_process_env"]);
	assert.deepEqual(config.vars, {
		ADAPTERS: "test",
		BUS_DEAD_LETTER: "tensquads-bus-dlq",
		CLERK_PLATFORM_ORG_ID: orgId,
	});
	assert.equal(config.browser, undefined);
	assert.equal(Object.hasOwn(config.vars, "MASTER_MODEL"), false);
	assert.equal(Object.hasOwn(config.vars, "MASTER_REASONING_EFFORT"), false);
	assert.deepEqual(config.durable_objects, {
		bindings: [{ name: "ACCOUNT_BUS", class_name: "AccountBus" }],
	});
	assert.deepEqual(config.migrations, [{ tag: "v1-account-bus", new_sqlite_classes: ["AccountBus"] }]);
	assert.deepEqual(config.queues, {
		producers: [{ binding: "BUS_QUEUE", queue: "tensquads-bus" }],
		consumers: [
			{ queue: "tensquads-bus", max_retries: 3, dead_letter_queue: "tensquads-bus-dlq" },
			{ queue: "tensquads-bus-dlq" },
		],
	});
	assert.deepEqual(config.observability, { enabled: true });
	assert.deepEqual(Object.keys(config.env), ["real"]);

	assert.deepEqual(real.vars, {
		ADAPTERS: "real",
		BUS_DEAD_LETTER: "tensquads-real-bus-dlq",
		CLERK_PLATFORM_ORG_ID: orgId,
		MASTER_MODEL: "gpt-6-luna",
		MASTER_REASONING_EFFORT: "medium",
	});
	assert.deepEqual(real.durable_objects, {
		bindings: [{ name: "ACCOUNT_BUS", class_name: "AccountBus" }],
	});
	assert.deepEqual(real.migrations, [{ tag: "v1-account-bus-real", new_sqlite_classes: ["AccountBus"] }]);
	assert.notEqual(real.migrations[0].tag, config.migrations[0].tag);
	assert.deepEqual(real.queues, {
		producers: [{ binding: "BUS_QUEUE", queue: "tensquads-real-bus" }],
		consumers: [
			{ queue: "tensquads-real-bus", max_retries: 3, dead_letter_queue: "tensquads-real-bus-dlq" },
			{ queue: "tensquads-real-bus-dlq" },
		],
	});
	assert.deepEqual(real.browser, { binding: "BROWSER" });
	assert.equal(real.name, undefined);

	const production = queueNames(config);
	const separate = queueNames(real);
	assert.deepEqual([...production].sort(), [...productionQueues].sort());
	assert.deepEqual([...separate].sort(), [...realQueues].sort());
	for (const name of separate) assert.equal(production.has(name), false, name);
	for (const name of production) assert.equal(JSON.stringify(real).includes(name), false, name);

	for (const key of keysNamed(config)) assert.equal(secrets.has(key), false, key);
	assert.deepEqual(
		[...text.matchAll(/"ADAPTERS"\s*:\s*"([^"]*)"/g)].map((match) => match[1]),
		["test", "real"],
	);
});
