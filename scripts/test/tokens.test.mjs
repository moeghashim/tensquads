import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildTokens } from "../generate-tokens.mjs";

const required = [
	"#c9c9c9",
	"#3a3a3a",
	"rgba(252,252,252,.9)",
	"rgba(255,255,255,.14)",
	"rgba(0,0,0,.2)",
	"rgba(0,0,0,.12)",
	"rgba(13,13,13,.24)",
	"#0169cc33",
	"rgba(1,105,204,.08)",
	"#95bf47",
	"#7f54b3",
	"#ff9900",
	"#f1641e",
	"#fde2f3",
	"#e5e9f0",
];

test("the committed tokens match the light theme and the inline overrides", () => {
	const built = buildTokens();
	const css = readFileSync(new URL("../../apps/web/src/design/tokens.css", import.meta.url), "utf8");
	const overrides = readFileSync(new URL("../../apps/web/src/design/OVERRIDES.md", import.meta.url), "utf8");
	assert.equal(css, built.css);
	assert.equal(overrides, built.overrides);
	assert.match(css, /--gray-0: #fff;/);
	assert.doesNotMatch(css, /dark theme value/i);
	for (const value of required) {
		assert.ok(overrides.includes(value), value);
		assert.ok(css.includes(value) || overrides.includes(`already \``), value);
	}
	for (const value of required) {
		if (value === "rgba(0,0,0,.2)") {
			assert.match(overrides, /rgba\(0,0,0,\.2\).*shadow-switch-thumb/);
			assert.match(css, /0 1px 2px rgba\(0,0,0,\.2\)/);
			continue;
		}
		assert.ok(css.includes(value), value);
	}
});
