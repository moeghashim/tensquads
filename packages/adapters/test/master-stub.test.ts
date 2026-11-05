import assert from "node:assert/strict";
import test from "node:test";

import { openMaster } from "../src/cloudflare-bus/master-stub.ts";

test("the test worker resolves the master to an empty port", async () => {
	assert.equal(await openMaster(), null);
});
