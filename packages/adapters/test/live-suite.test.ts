import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";

import { assertMachineEnv, boatVariableNames, environmentNames } from "./live/env-check.ts";
import { assertTrialProfile, trialIdentity } from "./live/identity.ts";

test("npm test does not load the live machine trial", () => {
	const names = readdirSync(new URL(".", import.meta.url), { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
		.map((entry) => entry.name);
	assert.equal(names.includes("machine-trial.test.ts"), false);
	assert.equal(readdirSync(new URL("./live", import.meta.url)).includes("machine-trial.test.ts"), true);
});

test("the machine env check accepts sent values, injected boat variables, and baseline names", () => {
	const sent = {
		ACCOUNT_ID: "trial1",
		TENSQUADS_AGENT_ID: "a1",
		IMAGE_TAG: "registry.agents.co/img1:1",
	};
	const stdout = [
		"ACCOUNT_ID=trial1",
		"TENSQUADS_AGENT_ID=a1",
		"IMAGE_TAG=registry.agents.co/img1:1",
		"BOAT_ID=boat-1",
		"ASCII_TOKEN=present",
		"AGENT_ID=injected",
		"ENVIRONMENT_ID=injected",
		"PRODUCT_MODE=injected",
		"ASCII_PORT=injected",
		"ASCII_API_URL=injected",
	].join("\n");
	const system = ["HOME", "LANG", "PATH", "PWD", "SHELL", "USER"];
	const withSystem = `${stdout}\n${system.map((name) => `${name}=present`).join("\n")}`;
	assertMachineEnv(stdout, sent, ["boat-api-key-value"], []);
	assertMachineEnv(withSystem, sent, ["boat-api-key-value"], system);
	assert.deepEqual(environmentNames("PATH=/usr/bin\nHOME=/home\n\nNOT_A_PAIR\n"), ["HOME", "PATH"]);
	assert.deepEqual(boatVariableNames(stdout), [
		"AGENT_ID",
		"ASCII_API_URL",
		"ASCII_PORT",
		"ASCII_TOKEN",
		"BOAT_ID",
		"ENVIRONMENT_ID",
		"PRODUCT_MODE",
	]);
	assert.throws(
		() => assertMachineEnv(stdout, { TENSQUADS_AGENT_ID: "other" }, [], []),
		/The machine env TENSQUADS_AGENT_ID does not match the sent value/,
	);
	assert.throws(
		() =>
			assertMachineEnv(`${stdout}\nNOTE=boat-api-key-value`, { ACCOUNT_ID: "trial1" }, ["boat-api-key-value"], []),
		/The machine env holds a boat API key\./,
	);
	assert.throws(
		() => assertMachineEnv(`${stdout}\nPATH=boat-api-key-value`, sent, ["boat-api-key-value"], ["PATH"]),
		/The machine env holds a boat API key\./,
	);
	assert.throws(
		() => assertMachineEnv(`${stdout}\nTENSQUADS_TRIAL_KEY=configured`, sent, [], ["TENSQUADS_TRIAL_KEY"]),
		/The secret name is present on the machine\./,
	);
	assert.throws(
		() => assertMachineEnv(`${stdout}\nPATH=/usr/bin`, sent, [], []),
		/The machine env has an unexpected variable: PATH\./,
	);
	assert.throws(
		() => assertMachineEnv(`${withSystem}\nHOSTNAME=box`, sent, [], system),
		/The machine env has an unexpected variable: HOSTNAME\./,
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
