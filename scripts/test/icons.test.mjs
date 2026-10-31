import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { buildIcons } from "../generate-icons.mjs";

const drawn = [
	"M8 2.5V5",
	"M3 8h10M9 4l4 4-4 4",
	"M8 13V3",
	"M2.5 4.5a2 2 0",
	"M2.5 8.5 6 12l7.5-8",
	"M10 3 5 8l5 5",
	"M4 4l8 8",
	"M8 1.8 13.5 5v6",
	"M7 5 4 11",
	'x="9" y="9"',
	"M2.5 13.5v-8l5.5-3",
	"M8 7v4M8 5h0",
	"M2.5 4.5h11v8h-11z",
	'cx="5.5"',
	"M8 2.5v11M2.5 8h11",
	'y="9" width="12" height="4"',
	'cx="11" cy="4"',
	"M2.5 6.5 8 2.5l5.5 4v7",
	"M2 7h12M6 7v6",
];

test("each design icon is a 16 px stroke at 1.5", () => {
	const built = buildIcons();
	const dir = new URL("../../apps/web/src/design/icons/", import.meta.url);
	const names = readdirSync(dir)
		.filter((name) => name.endsWith(".svg"))
		.sort();
	assert.deepEqual(names, Object.keys(built).sort());
	const all = [];
	for (const name of names) {
		const text = readFileSync(new URL(name, dir), "utf8");
		assert.equal(text, built[name]);
		assert.match(text, /width="16"/);
		assert.match(text, /height="16"/);
		assert.match(text, /viewBox="0 0 16 16"/);
		assert.match(text, /stroke-width="1.5"/);
		all.push(text);
	}
	const joined = all.join("\n");
	for (const fragment of drawn) {
		assert.ok(joined.includes(fragment), fragment);
	}
});
