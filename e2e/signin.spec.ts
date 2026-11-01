import {
	expect,
	expectLabeledInputs,
	expectNamedButtons,
	expectNoHorizontalScroll,
	secretsFor,
	test,
	viewports,
	waitForScreenFonts,
	watchPageErrors,
} from "./support.ts";

test("an empty sign-in shows the design error", async ({ page }) => {
	await page.goto("/signin");
	await expect(page).toHaveTitle("Sign in");
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page.getByRole("alert")).toHaveText("Enter your email and password to sign in.");
	await expect(page).toHaveURL(/\/signin$/);
});

test("a rejected sign-in shows the wrong-password text", async ({ page }) => {
	secretsFor(["publishable", "secret"]);
	const notes = watchPageErrors(page);
	await page.goto("/signin");
	await page.getByLabel("Email").fill("nobody@example.com");
	await page.getByLabel("Password").fill("not-a-real-password");
	await page.getByRole("button", { name: "Sign in" }).click();
	try {
		await expect(page.getByRole("alert")).toHaveText("That email or password is wrong.", { timeout: 20_000 });
	} catch (error) {
		const detail = notes.join(" | ");
		throw new Error(`${error instanceof Error ? error.message : "alert missing"}. Notes: ${detail || "none"}.`);
	}
	await expect(page).toHaveURL(/\/signin$/);
});

test("forgot password and the email link do nothing", async ({ page }) => {
	await page.goto("/signin");
	await page.getByRole("button", { name: "Forgot password?" }).click();
	await expect(page).toHaveURL(/\/signin$/);
	await page.getByRole("button", { name: "Email me a sign-in link" }).click();
	await expect(page).toHaveURL(/\/signin$/);
	await expect(page.getByRole("heading", { name: "Sign in to tensquads" })).toBeVisible();
});

test("sign-in controls have labels and the focus ring", async ({ page }) => {
	await page.goto("/signin");
	await expectLabeledInputs(page);
	await expectNamedButtons(page);
	await page.getByLabel("Email").focus();
	await page.keyboard.press("Shift+Tab");
	await page.keyboard.press("Tab");
	const outline = await page.getByLabel("Email").evaluate((element) => getComputedStyle(element).outline);
	expect(outline).toContain("rgb(1, 105, 204)");
	expect(outline).toContain("2px");
});

for (const viewport of viewports) {
	test(`sign-in at ${viewport.name}`, async ({ page }) => {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await page.goto("/signin");
		await waitForScreenFonts(page);
		await expectNoHorizontalScroll(page);
		await expect(page).toHaveScreenshot(`signin-${viewport.name}.png`, { fullPage: true });
	});
}
