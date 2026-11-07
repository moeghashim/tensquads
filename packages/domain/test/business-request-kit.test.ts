import assert from "node:assert/strict";
import test from "node:test";

import { parseResearchTask } from "@tensquads/agent-kit";

import { parseBusinessChat, researchFields } from "../src/conversation/business-request.ts";

test("the research payload passes the kit's parser with a location", () => {
	const request = parseBusinessChat(
		"restaurant: Al Ameer; Cuisine: Lebanese; City: Dearborn Heights, MI; Hummus|7.99|Starters",
	);
	assert.ok(request);
	const task = parseResearchTask(researchFields(request).payload);
	assert.equal(task.location, "Dearborn Heights, MI");
	assert.equal(task.businessName, "Al Ameer");
	assert.equal(task.cuisine, "Lebanese");
});

test("the research payload passes the kit's parser without a location", () => {
	const request = parseBusinessChat("grocer: Noon Market\nMilk | 3 | Dairy");
	assert.ok(request);
	const task = parseResearchTask(researchFields(request).payload);
	assert.equal(task.location, undefined);
	assert.equal("location" in task, false);
});
