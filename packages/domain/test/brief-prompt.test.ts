import assert from "node:assert/strict";
import { test } from "node:test";

import { briefPrompt } from "../src/master/brief-prompt.ts";

// The brief check needs the gap sentence as written. The prompt asks the model to copy it.
test("the brief prompt asks the model to start with the gap sentence, copied exactly", () => {
	const gap = "Nearby menus list prices but do not describe the dishes.";
	const prompt = briefPrompt({
		businessName: "Proof Kitchen",
		businessType: "restaurant",
		report: { gap, sources: ["https://rival.example"] },
	} as never);
	const lines = prompt.split("\n");
	const ask = lines.indexOf("Start the brief with this sentence. Copy it exactly, character for character:");
	assert.notEqual(ask, -1);
	assert.equal(lines[ask + 1], gap);
});
