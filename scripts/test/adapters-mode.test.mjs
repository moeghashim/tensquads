import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { adaptersMode, masterStubId } from "../../apps/web/adapters-mode.ts";

const wrangler = readFileSync(new URL("../../apps/web/wrangler.jsonc", import.meta.url), "utf8");

// The first ADAPTERS string in the file is production. A real build must not use it.
const flipped = `{"env":{"real":{"vars":{"ADAPTERS":"real"}}},"vars":{"ADAPTERS":"test"}}`;

test("a production build stubs the master and a real build does not", () => {
	assert.equal(/"ADAPTERS"\s*:\s*"([^"]*)"/.exec(wrangler)?.[1], "test");
	assert.equal(adaptersMode(wrangler, undefined), "test");
	assert.equal(adaptersMode(wrangler, ""), "test");
	assert.equal(adaptersMode(wrangler, "real"), "real");
	assert.equal(adaptersMode(wrangler, "staging"), "test");
	assert.equal(/"ADAPTERS"\s*:\s*"([^"]*)"/.exec(flipped)?.[1], "real");
	assert.equal(adaptersMode(flipped, undefined), "test");
	assert.equal(adaptersMode(flipped, "real"), "real");
});

test("the stub resolution follows that mode", () => {
	const stub = fileURLToPath(new URL("../../packages/adapters/src/cloudflare-bus/master-stub.ts", import.meta.url));
	assert.equal(masterStubId(adaptersMode(wrangler, undefined), "/app/master-live.ts", stub), stub);
	assert.equal(masterStubId(adaptersMode(wrangler, "real"), "/app/master-live.ts", stub), null);
	assert.equal(masterStubId(adaptersMode(wrangler, undefined), "/app/other.ts", stub), null);
	assert.equal(masterStubId(adaptersMode(wrangler, "real"), "/app/other.ts", stub), null);
});
