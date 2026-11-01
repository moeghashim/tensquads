import {
	expect,
	expectLabeledInputs,
	expectNamedButtons,
	expectNoHorizontalScroll,
	test,
	viewports,
	waitForScreenFonts,
} from "./support.ts";

test("the homepage toggle changes the prompt and fills an example", async ({ page }) => {
	await page.goto("/");
	const box = page.getByRole("textbox", { name: "Describe your business" });
	await expect(box).toHaveAttribute("placeholder", "Paste your store URL or describe what you sell…");
	await expect(page.getByRole("button", { name: "A cafe with a wholesale side" })).toBeVisible();
	await page.getByRole("button", { name: "New business" }).click();
	await expect(box).toHaveAttribute("placeholder", "Describe what you want to sell and to whom…");
	await expect(page.getByRole("button", { name: "Handmade ceramics on Etsy" })).toBeVisible();
	await page.getByRole("button", { name: "Handmade ceramics on Etsy" }).click();
	await expect(box).toHaveValue("Handmade ceramics on Etsy");
});

test("homepage calls to action follow the design routes", async ({ page }) => {
	await page.goto("/");
	await page.locator("nav").getByRole("link", { name: "Sign in" }).click();
	await expect(page).toHaveURL(/\/signin$/);
	await page.goto("/");
	await page.locator("nav").getByRole("link", { name: "Start free" }).click();
	await expect(page).toHaveURL(/\/signup$/);
	await page.goto("/");
	await page.getByRole("link", { name: "Build my squad" }).click();
	await expect(page).toHaveURL(/\/signup$/);
	await page.goto("/");
	await page.getByRole("link", { name: "Talk to us" }).click();
	await expect(page).toHaveURL(/\/signup$/);
	await page.goto("/");
	await page.getByRole("link", { name: "See a live demo" }).click();
	await expect(page).toHaveURL(/\/signin$/);
});

test("homepage anchors scroll to the named sections", async ({ page }) => {
	await page.goto("/");
	for (const [name, id] of [
		["Agents", "squad"],
		["How it works", "how"],
		["Control", "control"],
		["Pricing", "pricing"],
	] as const) {
		await page.locator("nav").getByRole("link", { name, exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`#${id}$`));
		await expect(page.locator(`#${id}`)).toBeInViewport();
	}
});

test("homepage controls have labels and the focus ring", async ({ page }) => {
	await page.goto("/");
	await expect(page).toHaveTitle("tensquads homepage");
	await expectLabeledInputs(page);
	await expectNamedButtons(page);
	await page.keyboard.press("Tab");
	const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outline);
	expect(outline).toContain("rgb(1, 105, 204)");
	expect(outline).toContain("2px");
});

for (const viewport of viewports) {
	test(`homepage at ${viewport.name}`, async ({ page }) => {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await page.goto("/");
		await waitForScreenFonts(page);
		await expectNoHorizontalScroll(page);
		await expect(page).toHaveScreenshot(`home-${viewport.name}.png`, { fullPage: true });
	});
}
