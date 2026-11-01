import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const reason = "The design keeps this link as #.";

test("design hash controls are anchors", () => {
	const home = readFileSync(new URL("../../apps/web/src/screens/home/HomeRest.tsx", import.meta.url), "utf8");
	const signin = readFileSync(new URL("../../apps/web/src/screens/signin/SignInPage.tsx", import.meta.url), "utf8");
	for (const name of ["About", "Blog", "Careers", "Contact", "Terms", "Privacy", "Security"]) {
		assert.match(home, new RegExp(`<a\\b[^>]*href="#"[^>]*>\\s*${name}\\s*</a>`));
	}
	assert.match(signin, /<a\b[^>]*href="#"[^>]*>\s*Forgot password\?\s*<\/a>/);
	assert.match(signin, /<a\b[^>]*href="#"[^>]*>[\s\S]*?Email me a sign-in link\s*<\/a>/);
	const anchors = `${home}\n${signin}`.match(/<a\b[^>]*href="#"/g) ?? [];
	assert.equal(anchors.length, 9);
	const ignores = `${home}\n${signin}`.match(new RegExp(reason.replace(/[.]/g, "\\."), "g")) ?? [];
	assert.equal(ignores.length, 9);
});
