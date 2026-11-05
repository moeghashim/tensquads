import {
	expect,
	expectLabeledInputs,
	expectNamedButtons,
	expectNoHorizontalScroll,
	skipUnlessMacScreenshot,
	test,
	viewports,
	waitForHydration,
	waitForScreenFonts,
} from "./support.ts";

test("details keeps every selected channel and platform on", async ({ page }) => {
	await page.goto("/signup");
	await page.getByRole("button", { name: /A new business/ }).click();
	const online = page.getByRole("button", { name: "Online store", exact: true });
	const marketplace = page.getByRole("button", { name: "Marketplace", exact: true });
	await expect(online).toHaveAttribute("aria-pressed", "true");
	await marketplace.click();
	await expect(online).toHaveAttribute("aria-pressed", "true");
	await expect(marketplace).toHaveAttribute("aria-pressed", "true");
	await marketplace.click();
	await expect(marketplace).toHaveAttribute("aria-pressed", "false");
	await expect(online).toHaveAttribute("aria-pressed", "true");

	await page.getByRole("button", { name: "Back", exact: true }).click();
	await page.getByRole("button", { name: /An existing business/ }).click();
	const shopify = page.getByRole("button", { name: "Shopify", exact: true });
	const amazon = page.getByRole("button", { name: "Amazon", exact: true });
	await expect(shopify).toHaveAttribute("aria-pressed", "true");
	await amazon.click();
	await expect(shopify).toHaveAttribute("aria-pressed", "true");
	await expect(amazon).toHaveAttribute("aria-pressed", "true");
	await amazon.click();
	await expect(amazon).toHaveAttribute("aria-pressed", "false");
	await expect(shopify).toHaveAttribute("aria-pressed", "true");
});

test("sign-up starts at business type and pre-selects the design squads", async ({ page }) => {
	await page.goto("/signup");
	await expect(page).toHaveTitle("Create your business");
	await expect(page.getByRole("heading", { name: "Where are you starting from?" })).toBeVisible();
	await page.getByRole("button", { name: /A new business/ }).click();
	await expect(page.getByText("Tell us about the business you want to start")).toBeVisible();
	await expect(page.getByText("What will you sell, and to whom?")).toBeVisible();
	await page.getByRole("button", { name: "Choose my squads" }).click();
	await expect(page.getByText("3 squads and Petra's squad will be created.")).toBeVisible();
	await expect(page.getByRole("button", { name: /Drafts your launch campaign/ })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(page.getByRole("button", { name: /Weekly profit summary/ })).toHaveAttribute("aria-pressed", "false");
	await page.getByRole("button", { name: "Back" }).click();
	await expect(page.getByRole("button", { name: "Choose my squads" })).toBeVisible();
	await page.getByRole("button", { name: "Back" }).click();
	await expect(page.getByRole("heading", { name: "Where are you starting from?" })).toBeVisible();
});

test("an existing business shows its fields and four starter squads", async ({ page }) => {
	await page.goto("/signup");
	await page.getByRole("button", { name: /An existing business/ }).click();
	await expect(page.getByText("Tell us about your business")).toBeVisible();
	await expect(page.getByText("Where do you sell today?")).toBeVisible();
	await expect(page.getByLabel("Website")).toBeVisible();
	const amazon = page.getByRole("button", { name: "Amazon" });
	await expect(amazon).toHaveAttribute("aria-pressed", "false");
	await amazon.click();
	await expect(amazon).toHaveAttribute("aria-pressed", "true");
	await amazon.click();
	await expect(amazon).toHaveAttribute("aria-pressed", "false");
	const under = page.getByRole("button", { name: "Under 100" });
	const mid = page.getByRole("button", { name: "100 to 500" });
	await expect(mid).toHaveAttribute("aria-pressed", "true");
	await under.click();
	await expect(under).toHaveAttribute("aria-pressed", "true");
	await expect(mid).toHaveAttribute("aria-pressed", "false");
	await page.getByRole("button", { name: "Choose my squads" }).click();
	await expect(page.getByText("4 squads and Petra's squad will be created.")).toBeVisible();
	await expect(page.getByRole("button", { name: /Syncs tracking and chases the maker/ })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(page.getByRole("button", { name: /Drafts your launch campaign/ })).toHaveCount(0);
	await expect(page.getByRole("button", { name: /Watches ad spend and return/ })).toHaveAttribute(
		"aria-pressed",
		"false",
	);
});

test("zero squads do not open the account form", async ({ page }) => {
	await page.goto("/signup");
	await page.getByRole("button", { name: /A new business/ }).click();
	await page.getByRole("button", { name: "Choose my squads" }).click();
	for (const name of [/Ready for your first order/, /Replies in your voice/, /Drafts your launch campaign/]) {
		await page.getByRole("button", { name }).click();
	}
	await expect(page.getByText("Pick at least one squad to start.")).toBeVisible();
	await page.getByRole("button", { name: "Create my workspace" }).click();
	await expect(page.getByLabel("Email")).toHaveCount(0);
	await expect(page).toHaveURL(/\/signup$/);
});

test("the account step reuses the sign-in fields and blocks empty input", async ({ page }) => {
	await page.goto("/signup");
	await page.getByRole("button", { name: /A new business/ }).click();
	await page.getByRole("button", { name: "Choose my squads" }).click();
	await page.getByRole("button", { name: "Create my workspace" }).click();
	await expect(page.locator("ol li")).toHaveCount(3);
	await expect(page.getByText("Business type", { exact: true })).toBeVisible();
	await expect(page.locator("ol").getByText("Squads", { exact: true })).toBeVisible();
	await expect(page.getByLabel("Email")).toHaveAttribute("placeholder", "you@company.com");
	await expect(page.getByLabel("Password")).toHaveAttribute("placeholder", "Your password");
	await page.getByRole("button", { name: "Create my workspace" }).click();
	await expect(page.getByRole("alert")).toHaveText("Enter your email and password to sign in.");
	await expect(page).toHaveURL(/\/signup$/);
	await page.getByRole("button", { name: "Back" }).click();
	await expect(page.getByText("3 squads and Petra's squad will be created.")).toBeVisible();
});

test("sign-up controls have labels", async ({ page }) => {
	await page.goto("/signup");
	await page.getByRole("button", { name: /A new business/ }).click();
	await expectLabeledInputs(page);
	await expectNamedButtons(page);
});

for (const viewport of viewports) {
	test(`sign-up at ${viewport.name}`, async ({ page }) => {
		skipUnlessMacScreenshot();
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await page.goto("/signup");
		await waitForScreenFonts(page);
		await waitForHydration(page);
		await page.evaluate(() => document.fonts.ready);
		await expectNoHorizontalScroll(page);
		await expect(page).toHaveScreenshot(`signup-${viewport.name}.png`, { fullPage: true });
	});
}

for (const viewport of viewports) {
	test(`sign-up squads at ${viewport.name}`, async ({ page }) => {
		skipUnlessMacScreenshot();
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await page.goto("/signup");
		await page.getByRole("button", { name: /A new business/ }).click();
		await page.getByRole("button", { name: "Choose my squads" }).click();
		await expect(page.getByRole("heading", { name: "Your first squads for your business" })).toBeVisible();
		await waitForScreenFonts(page);
		await page.evaluate(() => document.fonts.ready);
		await expectNoHorizontalScroll(page);
		await expect(page).toHaveScreenshot(`signup-squads-${viewport.name}.png`, { fullPage: true });
	});
}
