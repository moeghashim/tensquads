import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { compareInventory } from "../design-inventory.mjs";

const design = {
	texts: ["Hello", "About"],
	handlers: [{ tag: "button", event: "onClick", handler: "onDraft" }],
	loops: [{ kind: "for", list: "logos", as: "l" }],
	links: ["#", "Home.dc.html"],
	strings: { Orders: 1 },
};

test("an extra paragraph, a missing string, and a changed link fail the inventory", () => {
	const directory = mkdtempSync(join(tmpdir(), "tensquads-inventory-"));
	const clean = join(directory, "clean.html");
	const dirty = join(directory, "dirty.html");
	const missing = join(directory, "missing.html");
	const changed = join(directory, "changed.html");
	const body =
		'<div data-loop="logos" data-loop-as="l"><span>Orders</span></div><a href="/"></a><a href="#">About</a><button data-handler="onDraft">Hello</button>';
	writeFileSync(clean, `<main><p>Hello</p>${body}</main>`);
	writeFileSync(dirty, `<main><p>Hello</p><p>Not approved.</p>${body}</main>`);
	writeFileSync(missing, `<main><p>Hi</p>${body.replace("Hello", "Hi")}</main>`);
	writeFileSync(changed, `<main><p>Hello</p>${body.replace('href="/"', 'href="/pricing"')}</main>`);
	try {
		const cleanDiff = compareInventory(design, inventory(clean), { texts: [], links: [], handlers: [] });
		assert.deepEqual(cleanDiff.extraTexts, []);
		assert.deepEqual(cleanDiff.missingTexts, []);
		assert.deepEqual(cleanDiff.missingLinks, []);
		assert.deepEqual(cleanDiff.extraLinks, []);
		const dirtyDiff = compareInventory(design, inventory(dirty), { texts: [], links: [], handlers: [] });
		assert.deepEqual(dirtyDiff.extraTexts, ["Not approved."]);
		const missingDiff = compareInventory(design, inventory(missing), { texts: [], links: [], handlers: [] });
		assert.deepEqual(missingDiff.missingTexts, ["Hello"]);
		const linkDiff = compareInventory(design, inventory(changed), { texts: [], links: [], handlers: [] });
		assert.deepEqual(linkDiff.extraLinks, ["/pricing"]);
		assert.deepEqual(linkDiff.missingLinks, ["/"]);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

function inventory(file) {
	const out = `${file}.json`;
	execFileSync(process.execPath, ["scripts/design-inventory.mjs", "--html", file, "--out", out], {
		cwd: new URL("../..", import.meta.url).pathname,
	});
	return JSON.parse(readFileSync(out, "utf8"));
}
