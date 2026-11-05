import { accessibilityViolations } from "./accessibility-helper.ts";

import { expect, test, viewports, waitForScreenFonts } from "./support.ts";

for (const path of ["/", "/signup", "/signin"] as const) {
	for (const viewport of viewports) {
		test(`${path} passes axe at ${viewport.name}`, async ({ page }) => {
			await page.setViewportSize({ width: viewport.width, height: viewport.height });
			await page.goto(path);
			await waitForScreenFonts(page);
			expect(await accessibilityViolations(page)).toEqual([]);
		});
	}
}

for (const viewport of viewports) {
	test(`sign-up squads passes axe at ${viewport.name}`, async ({ page }) => {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await page.goto("/signup");
		await page.getByRole("button", { name: /A new business/ }).click();
		await page.getByRole("button", { name: "Choose my squads" }).click();
		await expect(page.getByRole("heading", { name: "Your first squads for your business" })).toBeVisible();
		await waitForScreenFonts(page);
		expect(await accessibilityViolations(page)).toEqual([]);
	});
}
