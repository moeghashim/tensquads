import assert from "node:assert/strict";
import test from "node:test";

import { requestModelBrief } from "../src/cloudflare-bus/model-request.ts";

test("the master request sends reasoning_effort when it is set", async () => {
	let seen = "";
	let header = "";
	const content = await requestModelBrief(
		async (_url, init) => {
			seen = String(init?.body ?? "");
			header = String(new Headers(init?.headers).get("authorization") ?? "");
			return new Response(JSON.stringify({ choices: [{ message: { content: "A short brief." } }] }));
		},
		"test-key",
		"gpt-6-luna",
		"medium",
		"price",
	);
	assert.equal(content, "A short brief.");
	assert.equal(JSON.parse(seen).model, "gpt-6-luna");
	assert.equal(JSON.parse(seen).reasoning_effort, "medium");
	assert.equal(seen.includes("test-key"), false);
	assert.equal(header.startsWith("Bearer "), true);
	const plain = await requestModelBrief(
		async (_url, init) => {
			seen = String(init?.body ?? "");
			return new Response(JSON.stringify({ choices: [{ message: { content: "Plain." } }] }));
		},
		"test-key",
		"gpt-6-luna",
		"",
		"price",
	);
	assert.equal(plain, "Plain.");
	assert.equal(Object.hasOwn(JSON.parse(seen), "reasoning_effort"), false);
});
