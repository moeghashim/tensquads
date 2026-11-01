import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const spec = readFileSync(new URL("../../packages/statecharts/signup/Signup.tla", import.meta.url), "utf8");
const config = readFileSync(new URL("../../packages/statecharts/signup/Signup.cfg", import.meta.url), "utf8");

test("Submit splits the request, the created account, and a failed navigation", () => {
	assert.equal(spec.includes("OpenHasNoAccount"), false);
	assert.equal(config.includes("OpenHasNoAccount"), false);
	assert.match(spec, /^Create ==/m);
	assert.match(spec, /^FailResponse ==/m);
	assert.match(spec, /^FailNavigation ==/m);
	assert.match(spec, /^FindExisting ==/m);
	assert.equal(/accounts'\s*=\s*accounts\s*\+\s*1/.test(spec), false);
	const create = spec.slice(spec.indexOf("Create =="), spec.indexOf("FindExisting =="));
	assert.match(create, /accounts = 0/);
	assert.match(create, /accounts' = 1/);
	const retry = spec.slice(spec.indexOf("FindExisting =="), spec.indexOf("FailResponse =="));
	assert.match(retry, /accounts = 1/);
	assert.match(retry, /UNCHANGED <<step, kind, picked, preset, toggled, accounts>>/);
});
