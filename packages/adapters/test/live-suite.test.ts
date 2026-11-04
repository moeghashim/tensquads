import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";

import { assertMachineEnv } from "./live/env-check.ts";
import { assertTrialProfile, trialIdentity } from "./live/identity.ts";

test("npm test does not load the live machine trial", () => {
	const names = readdirSync(new URL(".", import.meta.url), { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
		.map((entry) => entry.name);
	assert.equal(names.includes("machine-trial.test.ts"), false);
	assert.equal(readdirSync(new URL("./live", import.meta.url)).includes("machine-trial.test.ts"), true);
});

test("the machine env check accepts the three sent values and the two boat variables", () => {
	const stdout = [
		"ACCOUNT_ID=trial1",
		"TENSQUADS_AGENT_ID=a1",
		"IMAGE_TAG=registry.agents.co/img1:1",
		"BOAT_ID=boat-1",
		"ASCII_TOKEN=present",
		"PATH=/usr/bin",
	].join("\n");
	assertMachineEnv(
		stdout,
		{
			ACCOUNT_ID: "trial1",
			TENSQUADS_AGENT_ID: "a1",
			IMAGE_TAG: "registry.agents.co/img1:1",
		},
		["boat-api-key-value"],
	);
	assert.throws(
		() => assertMachineEnv(`${stdout}\nAGENT_ID=a1`, { ACCOUNT_ID: "trial1" }, []),
		/Unexpected boat variables: AGENT_ID/,
	);
	assert.throws(
		() => assertMachineEnv(`${stdout}\nNOTE=boat-api-key-value`, { ACCOUNT_ID: "trial1" }, ["boat-api-key-value"]),
		/The machine env holds a boat API key\./,
	);
});

test("the trial identity refuses a closed profile and a short run id", () => {
	assert.throws(() => assertTrialProfile("default"), /The trial profile is closed/);
	assert.throws(() => assertTrialProfile("moe@10claws.com"), /The trial profile is closed/);
	assert.throws(() => trialIdentity("12"), /The run id is not valid/);
	const trial = trialIdentity("41877304107");
	assert.equal(trial.templateId, "tensquads-img41877304107-1");
	assert.equal(trial.tag, "registry.agents.co/img41877304107:1");
});
