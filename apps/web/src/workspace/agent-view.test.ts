import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { initials, ownerText } from "./agent-view.ts";

describe("owner label", () => {
	it("shows an em dash for a blank owner", () => {
		assert.equal(initials(""), "—");
		assert.equal(initials("   "), "—");
		assert.equal(ownerText(""), "—");
		assert.equal(ownerText("   "), "—");
	});

	it("keeps a named owner and an email", () => {
		assert.equal(initials("Moe Ghashim"), "MG");
		assert.equal(ownerText("Moe Ghashim"), "Moe Ghashim");
		assert.equal(initials("moe@example.com"), "MO");
		assert.equal(ownerText("moe@example.com"), "moe@example.com");
	});
});
