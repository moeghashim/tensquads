import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildIcons } from "../generate-icons.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function designPaths() {
	const paths = [];
	const files = readdirSync(join(root, "design"))
		.filter((name) => name.endsWith(".dc.html"))
		.sort();
	for (const name of files) {
		const text = readFileSync(join(root, "design", name), "utf8");
		for (const match of text.matchAll(/\bd="([^"]+)"/g)) {
			paths.push(match[1]);
		}
	}
	return [...new Set(paths)];
}

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
	for (const path of designPaths()) {
		assert.ok(joined.includes(path), path);
	}
});
