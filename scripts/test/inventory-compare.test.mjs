import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "@playwright/test";
import { compareInventory, inventoryHtml } from "../design-inventory.mjs";
import { allowFor } from "../inventory-allow.mjs";
import { renderDesign } from "../render-design.mjs";
import { bundle } from "./screen-bundle.mjs";

const emptyDiff = {
	extraTexts: [],
	missingTexts: [],
	extraLinks: [],
	missingLinks: [],
	extraHandlers: [],
	missingHandlers: [],
	extraLoops: [],
	missingLoops: [],
};

async function capture(page) {
	const directory = mkdtempSync(join(process.cwd(), ".inventory-test-"));
	try {
		const html = join(directory, "body.html");
		writeFileSync(html, await page.locator("body").innerHTML());
		return JSON.parse(
			execFileSync(process.execPath, ["scripts/design-inventory.mjs", "--html", html], { encoding: "utf8" }),
		);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

test("built screen inventories match each rendered design state and reject occurrence faults", async () => {
	const browser = await chromium.launch({ headless: true });
	try {
		const canvas = await browser.newPage();
		for (const name of ["Home", "SignIn", "Onboarding"]) {
			const design = JSON.parse(readFileSync(`design/inventory/${name}.json`, "utf8"));
			const page = await browser.newPage();
			await page.setContent('<div id="root"></div>');
			await page.evaluate((name) => {
				window.screenName = name;
			}, name);
			await page.addScriptTag({ content: bundle.outputFiles[0].text });
			await page.getByText("tensquads", { exact: true }).first().waitFor();
			const compare = async (state = {}) => {
				const expected = await renderDesign(canvas, design, state, allowFor(name));
				const actual = await capture(page);
				assert.deepEqual(compareInventory(expected, actual), emptyDiff);
				return { expected, actual };
			};
			const { expected, actual } = await compare();
			if (name === "Home") {
				const extra = structuredClone(actual);
				extra.texts.push("About Terms");
				assert.deepEqual(compareInventory(expected, extra).extraTexts, ["About Terms"]);
				const missing = structuredClone(actual);
				missing.texts.splice(missing.texts.indexOf("Northwind Apparel"), 1);
				assert.deepEqual(compareInventory(expected, missing).missingTexts, ["Northwind Apparel"]);
				const changed = structuredClone(actual);
				changed.links.find((link) => link.text === "Security").href = "/signup";
				assert.deepEqual(compareInventory(expected, changed).extraLinks, [{ text: "Security", href: "/signup" }]);
				await page.getByRole("button", { name: "New business", exact: true }).click();
				await compare({ kind: "new" });
			} else if (name === "SignIn") {
				await page.getByRole("button", { name: "Sign in", exact: true }).click();
				await compare({ tried: true });
			} else {
				for (const kind of ["new", "existing"]) {
					await page
						.getByRole("button", { name: kind === "new" ? /A new business/ : /An existing business/ })
						.click();
					await compare({ kind, step: "details" });
					await page.getByRole("button", { name: "Choose my squads" }).click();
					await compare({ kind, step: "agents" });
					await page.getByRole("button", { name: "Create my workspace" }).click();
					await compare({ kind, step: "account" });
					for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Back", exact: true }).click();
				}
			}
			await page.close();
		}
	} finally {
		await browser.close();
	}
});

test("duplicates, control associations, and handler events remain significant", () => {
	const expected = inventoryHtml(
		'<p>Hello</p><p>Hello</p><a href="#">Security</a><a href="/signup">Start</a><button data-handler="pick">New</button><button data-handler="pick">Existing</button>',
	);
	for (const mutate of [
		(value) => value.texts.pop(),
		(value) => value.texts.push("Hello"),
		(value) => {
			value.links[0].href = "/signup";
		},
		(value) => {
			value.handlers[0].event = "onChange";
		},
		(value) => value.handlers.pop(),
		(value) => value.handlers.push(value.handlers[0]),
		(value) => {
			value.handlers[0].text = "Existing";
		},
	]) {
		const changed = structuredClone(expected);
		mutate(changed);
		assert.notDeepEqual(compareInventory(expected, changed), emptyDiff);
	}
});

test("built targets retain their literal URL instead of accepting design filenames", () => {
	const expected = inventoryHtml('<a href="/">tensquads</a>');
	const actual = inventoryHtml('<a href="Home.dc.html">tensquads</a>');
	assert.deepEqual(compareInventory(expected, actual).extraLinks, [{ text: "tensquads", href: "Home.dc.html" }]);
});
