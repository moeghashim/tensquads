import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "@playwright/test";
import { agentNames, rewriteBuiltInventory } from "../../e2e/squadmate-copy.ts";
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

async function assertHomeFaults(page, expected, actual) {
	await page.evaluate(() => {
		const paragraph = document.createElement("p");
		paragraph.textContent = "Save {amount}";
		document.body.append(paragraph);
	});
	assert.deepEqual(compareInventory(expected, await capture(page)).extraTexts, ["Save {amount}"]);
	await page.getByText("Save {amount}", { exact: true }).evaluate((paragraph) => paragraph.remove());
	const extra = structuredClone(actual);
	extra.texts.push("About Terms");
	assert.deepEqual(compareInventory(expected, extra).extraTexts, ["About Terms"]);
	const missing = structuredClone(actual);
	missing.texts.splice(missing.texts.indexOf("Northwind Apparel"), 1);
	assert.deepEqual(compareInventory(expected, missing).missingTexts, ["Northwind Apparel"]);
	const changed = structuredClone(actual);
	changed.links.find((link) => link.text === "Security").href = "/signup";
	assert.deepEqual(compareInventory(expected, changed).extraLinks, [{ text: "Security", href: "/signup" }]);
}

async function openBusinessKind(page, kind) {
	const name = kind === "new" ? /A new business/ : /An existing business/;
	await page.getByRole("button", { name }).click();
}

async function swapMissionAndIdea(page, expected) {
	await page.locator("#biz-mission").evaluate((node) => node.setAttribute("data-handler", "onIdea"));
	await page.locator("#biz-idea").evaluate((node) => node.setAttribute("data-handler", "onMission"));
	const diff = compareInventory(expected, await capture(page));
	assert.equal(diff.extraHandlers.length, 2);
	assert.equal(diff.missingHandlers.length, 2);
	await page.locator("#biz-mission").evaluate((node) => node.setAttribute("data-handler", "onMission"));
	await page.locator("#biz-idea").evaluate((node) => node.setAttribute("data-handler", "onIdea"));
}

async function compareOnboarding(page, compare) {
	for (const kind of ["new", "existing"]) {
		await openBusinessKind(page, kind);
		const { expected } = await compare({ kind, step: "details" });
		if (kind === "new") await swapMissionAndIdea(page, expected);
		await page.getByRole("button", { name: "Choose my squads" }).click();
		await compare({ kind, step: "agents" });
		await page.getByRole("button", { name: "Create my workspace" }).click();
		await compare({ kind, step: "account" });
		for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Back", exact: true }).click();
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
			if (name === "Home") {
				await canvas.setContent(readFileSync("docs/designs/home/home.html", "utf8"), {
					waitUntil: "domcontentloaded",
				});
			}
			const compare = async (state = {}) => {
				if (name === "Home" && state.kind) {
					await canvas.getByRole("button", { name: "New business", exact: true }).click();
				}
				const rendered =
					name === "Home" ? await capture(canvas) : await renderDesign(canvas, design, state, allowFor(name));
				const expected = name === "Onboarding" ? rewriteBuiltInventory(rendered, agentNames) : rendered;
				const actual = await capture(page);
				assert.deepEqual(compareInventory(expected, actual), emptyDiff);
				return { expected, actual };
			};
			const { expected, actual } = await compare();
			if (name === "Home") {
				await assertHomeFaults(page, expected, actual);
				await page.getByRole("button", { name: "New business", exact: true }).click();
				await compare({ kind: "new" });
			} else if (name === "SignIn") {
				await page.getByRole("button", { name: "Sign in", exact: true }).click();
				await compare({ tried: true });
			} else {
				await compareOnboarding(page, compare);
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

test("swapping onEmail and onPassword is a handler difference", () => {
	const pairs = [
		[
			'<label for="email">Email</label><input id="email" data-handler="onEmail" /><label for="password">Password</label><input id="password" data-handler="onPassword" />',
			'<label for="email">Email</label><input id="email" data-handler="onPassword" /><label for="password">Password</label><input id="password" data-handler="onEmail" />',
		],
		[
			'<label>Email</label><input data-handler="onEmail" /><label>Password</label><input data-handler="onPassword" />',
			'<label>Email</label><input data-handler="onPassword" /><label>Password</label><input data-handler="onEmail" />',
		],
	];
	for (const [before, after] of pairs) {
		const diff = compareInventory(inventoryHtml(before), inventoryHtml(after));
		assert.notDeepEqual(diff, emptyDiff);
		assert.equal(diff.extraHandlers.length, 2);
		assert.equal(diff.missingHandlers.length, 2);
	}
});

function assertTextareaSwap(missionId, ideaId, texts) {
	const before = `<label>Company mission</label><textarea${missionId} data-handler="onMission"></textarea><label>What will you sell, and to whom?</label><textarea${ideaId} data-handler="onIdea"></textarea>`;
	const after = `<label>Company mission</label><textarea${missionId} data-handler="onIdea"></textarea><label>What will you sell, and to whom?</label><textarea${ideaId} data-handler="onMission"></textarea>`;
	const expected = inventoryHtml(before);
	assert.deepEqual(
		expected.handlers.map((handler) => handler.text),
		texts,
	);
	const diff = compareInventory(expected, inventoryHtml(after));
	assert.equal(diff.extraHandlers.length, 2);
	assert.equal(diff.missingHandlers.length, 2);
}

test("swapping onMission and onIdea is a handler difference for textarea ids", () => {
	assertTextareaSwap(' id="biz-mission"', ' id="biz-idea"', ["biz-mission", "biz-idea"]);
});

test("swapping onMission and onIdea is a handler difference for textarea labels", () => {
	assertTextareaSwap("", "", ["Company mission", "What will you sell, and to whom?"]);
});
