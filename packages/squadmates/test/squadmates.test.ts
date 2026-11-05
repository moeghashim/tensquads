import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
	AGENT_LOOP_STATES,
	characterName,
	SQUADMATE_CSS,
	SQUADMATES,
	shownRoleTag,
	squadmateMarkup,
	UnknownSquadmateError,
	UnknownSquadmateStateError,
} from "../src/index.ts";

const TASK_TABLE: readonly (readonly [string, string, string, string | null])[] = [
	["master", "Petra", "Petra, Jordan", "Master"],
	["orders", "Pisa", "Pisa, Italy", "Orders"],
	["support", "Kyoto", "Kyoto, Japan", "Support"],
	["marketing", "Rio", "Rio de Janeiro, Brazil", "Marketing"],
	["finance", "Zurich", "Zurich, Switzerland", "Finance"],
	["inventory", "Giza", "Giza, Egypt", "Inventory"],
	["market", "Machu", "Machu Picchu, Peru", "Market researcher"],
	["website", "Angkor", "Angkor Wat, Cambodia", "Website builder"],
	["analytics", "Delphi", "Delphi, Greece", "Analytics"],
	["hr", "Sydney", "Sydney, Australia", "People"],
];

test("the roster is the task table", () => {
	assert.deepEqual(
		SQUADMATES.map((mate) => [mate.id, mate.name, mate.place, mate.roleTag]),
		TASK_TABLE,
	);
	assert.equal(SQUADMATES.find((mate) => mate.id === "master")?.role, "Master");
	assert.equal(SQUADMATES.find((mate) => mate.id === "hr")?.prop, "badge");
	assert.equal(characterName("orders"), "Pisa");
	assert.equal(characterName("master"), "Petra");
	assert.equal(characterName("not-a-squadmate"), null);
	assert.equal(shownRoleTag("orders"), "Orders");
	assert.equal(shownRoleTag("master"), null);
});

test("the nine Agent loop states stay in model order", () => {
	assert.deepEqual(
		AGENT_LOOP_STATES.map((state) => state.label),
		["Waiting", "Planning", "Running skill", "Checking", "Done", "Sent back", "Blocked", "Escalated", "Dropped"],
	);
});

test("every agent image in the seed has a squadmate", () => {
	const design = JSON.parse(readFileSync(new URL("../../seed/src/design.json", import.meta.url), "utf8")) as {
		seed: { images: { id: string }[] };
	};
	const ids = new Set<string>(SQUADMATES.map((mate) => mate.id));
	assert.equal(design.seed.images.length, 7);
	for (const image of design.seed.images) {
		assert.equal(ids.has(image.id), true, image.id);
	}
});

test("an unknown image id is an error", () => {
	assert.throws(() => squadmateMarkup("legal", "idle", 64), UnknownSquadmateError);
});

test("an unknown state is an error", () => {
	assert.throws(() => squadmateMarkup("orders", "asleep", 64), UnknownSquadmateStateError);
});

test("markup for each id and state stays the same", () => {
	const golden = JSON.parse(readFileSync(new URL("./markup.golden.json", import.meta.url), "utf8")) as Record<
		string,
		string
	>;
	const states = ["idle", ...AGENT_LOOP_STATES.map((state) => state.id)];
	for (const mate of SQUADMATES) {
		for (const state of states) {
			const key = `${mate.id}:${state}`;
			assert.equal(squadmateMarkup(mate.id, state, 64), golden[key], key);
		}
	}
});

test("size sets the svg width and height", () => {
	assert.match(squadmateMarkup("support", "idle", 24), /width="24" height="24"/);
	assert.match(squadmateMarkup("hr", "idle", 16), /width="16" height="16"/);
});

test("the same call returns the same markup", () => {
	assert.equal(squadmateMarkup("hr", "done", 48), squadmateMarkup("hr", "done", 48));
});

test("the blink style stays with the drawing", () => {
	assert.match(SQUADMATE_CSS, /\.sm-blink\{transform-box:fill-box/);
});

test("the package has no runtime dependency", () => {
	const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
		dependencies?: unknown;
	};
	assert.equal(pkg.dependencies, undefined);
});
