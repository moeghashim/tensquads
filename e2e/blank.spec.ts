import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const viewports = [
	{ name: "1440", width: 1440, height: 900 },
	{ name: "390", width: 390, height: 844 },
] as const;

for (const viewport of viewports) {
	test(`empty page at ${viewport.name}`, async ({ page }) => {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await page.goto("/");
		await expect(page).toHaveTitle("tensquads");
		expect((await page.locator("body").innerText()).trim()).toBe("");
		// The document title is "tensquads". A visible heading would be other text.
		// page-has-heading-one is a best-practice rule, so this run turns it off.
		const results = await new AxeBuilder({ page }).disableRules(["page-has-heading-one"]).analyze();
		expect(results.violations).toEqual([]);
		await expect(page).toHaveScreenshot(`empty-${viewport.name}.png`, { fullPage: true });
	});
}
