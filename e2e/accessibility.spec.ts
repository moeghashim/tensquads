import AxeBuilder from "@axe-core/playwright";

import { expect, test, viewports, waitForScreenFonts } from "./support.ts";

for (const path of ["/", "/signup", "/signin"] as const) {
	for (const viewport of viewports) {
		test(`${path} passes axe at ${viewport.name}`, async ({ page }) => {
			await page.setViewportSize({ width: viewport.width, height: viewport.height });
			await page.goto(path);
			await waitForScreenFonts(page);
			const results = await new AxeBuilder({ page }).analyze();
			expect(results.violations).toEqual([]);
		});
	}
}
