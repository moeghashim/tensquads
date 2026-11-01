import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("the browser resolves canvas, text, and ring", async ({ page }) => {
	const css = readFileSync(new URL("../apps/web/src/design/tokens.css", import.meta.url), "utf8");
	await page.setContent(`<!doctype html>
		<html>
			<head>
				<style>
					${css}
					#canvas { background-color: var(--canvas); }
					#text { color: var(--text); }
					#ring { outline: 3px solid var(--ring); }
				</style>
			</head>
			<body>
				<div id="canvas">canvas</div>
				<p id="text">text</p>
				<div id="ring">ring</div>
			</body>
		</html>`);
	const canvas = await page.locator("#canvas").evaluate((element) => getComputedStyle(element).backgroundColor);
	const text = await page.locator("#text").evaluate((element) => getComputedStyle(element).color);
	const ring = await page.locator("#ring").evaluate((element) => getComputedStyle(element).outlineColor);
	expect(canvas).toBe("rgb(243, 243, 243)");
	expect(text).toBe("rgb(40, 40, 40)");
	expect(ring).toBe("rgb(1, 105, 204)");
});
