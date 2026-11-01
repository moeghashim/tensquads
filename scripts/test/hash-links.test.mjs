import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import { bundle } from "./screen-bundle.mjs";

test("design hash controls render as real anchors", async () => {
	const browser = await chromium.launch({ headless: true });
	try {
		for (const signin of [false, true]) {
			const page = await browser.newPage();
			await page.setContent('<div id="root"></div>');
			await page.evaluate((value) => {
				window.screenName = value ? "SignIn" : "Home";
			}, signin);
			await page.addScriptTag({ content: bundle.outputFiles[0].text });
			const labels = signin
				? ["Forgot password?", "Email me a sign-in link"]
				: ["About", "Blog", "Careers", "Contact", "Terms", "Privacy", "Security"];
			for (const name of labels) {
				const anchor = page.getByRole("link", { name, exact: true });
				await anchor.waitFor();
				assert.equal(await anchor.getAttribute("href"), "#");
			}
			assert.equal(await page.locator('a[href="#"]').count(), labels.length);
			await page.close();
		}
	} finally {
		await browser.close();
	}
});
