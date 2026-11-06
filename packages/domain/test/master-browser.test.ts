import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { type Browser, chromium } from "playwright";

import { checkPage } from "../src/master/checks.ts";
import { proofStory } from "../src/master/proof.ts";
import { collectRendered, pageDocument, type RenderedPage } from "../src/master/render-page.ts";

let browser: Browser;

before(async () => {
	browser = await chromium.launch();
});

after(async () => {
	await browser.close();
});

async function render(html: string): Promise<RenderedPage> {
	const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
	try {
		await page.setContent(pageDocument(html), { waitUntil: "load" });
		return await page.evaluate(collectRendered);
	} finally {
		await page.close();
	}
}

async function checked(html: string) {
	const story = await proofStory();
	let calls = 0;
	const pages = { ...story.pages, [story.previewUrl]: { status: 200, body: html } };
	const result = await checkPage({
		previewUrl: story.previewUrl,
		businessName: story.request.businessName,
		businessType: story.request.businessType,
		cuisine: story.request.cuisine,
		items: story.request.items,
		brief: story.brief,
		report: story.report,
		slug: "proof",
		choice: story.choice,
		readPage: async (url) => pages[url] ?? { status: 404, body: "" },
		audit: () => story.audit,
		browser: async (body) => {
			calls += 1;
			return render(body);
		},
	});
	return { result, calls };
}

test("the rendered proof page passes the browser check", async () => {
	const story = await proofStory();
	const { result, calls } = await checked(story.pageHtml);
	assert.equal(calls, 1);
	assert.deepEqual(result.evidence, []);
	assert.equal(result.pass, true);
});

test("changed bytes fail the page check and the browser still checks layout", async () => {
	const story = await proofStory();
	const hidden = await checked(`<style>.menu{display:none}</style><div class="menu">${story.pageHtml}</div>`);
	assert.equal(hidden.calls, 1);
	assert.equal(hidden.result.pass, false);
	assert.equal(hidden.result.evidence.includes("The preview does not match the rendered page."), true);
	const offscreen = await checked(`<div style="position:absolute;left:-10000px">${story.pageHtml}</div>`);
	assert.equal(offscreen.result.pass, false);
	assert.equal(offscreen.result.evidence.includes("The preview does not match the rendered page."), true);
	const euro = await checked(`${story.pageHtml}<div>Dragon taco — €99</div>`);
	assert.equal(euro.result.pass, false);
	assert.equal(euro.result.evidence.includes("The preview does not match the rendered page."), true);
	const image = await checked(
		`${story.pageHtml}<img alt="Dragon taco" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22%3E%3C/svg%3E">`,
	);
	assert.equal(image.result.pass, false);
	assert.equal(image.result.evidence.includes("The page invents an item."), false);
	const wide = await checked(`${story.pageHtml}<div style="width:2000px;height:10px"></div>`);
	assert.equal(wide.result.pass, false);
	assert.equal(wide.result.evidence.includes("The page scrolls sideways at 390 px."), true);
	const keyboard = await checked(`${story.pageHtml}<a href="https://example.com/alpha" tabindex="-1">Alpha Grill</a>`);
	assert.equal(keyboard.result.pass, false);
	assert.equal(keyboard.result.evidence.includes("The keyboard check failed."), true);
	const contrast = await checked(
		`${story.pageHtml}<p style="color:#767676;background-color:#888888">Chicken tawook</p>`,
	);
	assert.equal(contrast.result.pass, false);
	assert.equal(contrast.result.evidence.includes("The contrast check failed."), true);
});
