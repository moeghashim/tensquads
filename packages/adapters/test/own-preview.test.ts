import assert from "node:assert/strict";
import { test } from "node:test";

import { ownPreviewTask } from "../src/cloudflare-bus/master-live.ts";

const base = "https://tensquads-real.moe-678.workers.dev";

// The worker cannot fetch its own address, so its own preview is read from storage.
test("a preview link on the worker's own host for this account gives the task id", () => {
	assert.equal(ownPreviewTask(`${base}/preview/dearborn-9/m-04`, "dearborn-9", base), "m-04");
});

test("another account, another host, or another path is fetched as before", () => {
	assert.equal(ownPreviewTask(`${base}/preview/other/m-04`, "dearborn-9", base), null);
	assert.equal(ownPreviewTask("https://evil.example/preview/dearborn-9/m-04", "dearborn-9", base), null);
	assert.equal(ownPreviewTask(`${base}/site/dearborn-9/m-04`, "dearborn-9", base), null);
	assert.equal(ownPreviewTask("not a url", "dearborn-9", base), null);
});
