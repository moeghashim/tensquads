# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: signup.spec.ts >> sign-up at 390
- Location: e2e/signup.spec.ts:101:2

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  913 pixels (ratio 0.01 of all image pixels) are different.

  Snapshot: signup-390.png

Call log:
  - Expect "toHaveScreenshot(signup-390.png)" with timeout 5000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 913 pixels (ratio 0.01 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 913 pixels (ratio 0.01 of all image pixels) are different.

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - banner [ref=e3]:
    - generic [ref=e4]: tensquads
    - generic [ref=e10]:
      - generic [ref=e11]: Already have an account?
      - link "Sign in" [ref=e12] [cursor=pointer]:
        - /url: /signin
  - main [ref=e13]:
    - region "What you get" [ref=e14]:
      - generic [ref=e15]:
        - generic [ref=e16]: Free for 14 days
        - heading "Run your business with a team of squads" [level=1] [ref=e17]
        - paragraph [ref=e18]: "Each part of your business gets its own squad: one agent with its tools. A master squad coordinates them, and every squad works toward your mission."
      - list [ref=e19]:
        - listitem [ref=e20]:
          - generic [ref=e24]:
            - generic [ref=e25]: Orders, support, marketing, finance, stock
            - generic [ref=e26]: Start with the squads you need. Add more later.
        - listitem [ref=e27]:
          - generic [ref=e34]:
            - generic [ref=e35]: You set the limits
            - generic [ref=e36]: "Refunds, ad spend, reorders: squads stay inside them or ask first."
        - listitem [ref=e37]:
          - generic [ref=e41]:
            - generic [ref=e42]: One chat for everything
            - generic [ref=e43]: Ask the master what's going on; it routes the question to the right squad.
      - generic [ref=e44]:
        - generic [ref=e45]: "[CUSTOMER QUOTE]"
        - generic [ref=e46]: "[CUSTOMER NAME], [BUSINESS]"
    - region "Create your business" [ref=e47]:
      - list [ref=e48]:
        - listitem [ref=e49]:
          - generic [ref=e50]: "1"
          - generic [ref=e51]: Business type
        - listitem [ref=e53]:
          - generic [ref=e54]: "2"
          - generic [ref=e55]: Details
        - listitem [ref=e57]:
          - generic [ref=e58]: "3"
          - generic [ref=e59]: Squads
      - generic [ref=e60]:
        - generic [ref=e61]:
          - heading "Where are you starting from?" [level=2] [ref=e62]
          - paragraph [ref=e63]: This decides which squads we set up first and what we ask you to connect.
        - generic [ref=e64]:
          - 'button "A new business I have an idea or a product and nothing is set up yet. Squads help me launch: store, first products, first campaign." [ref=e65] [cursor=pointer]':
            - generic [ref=e69]: A new business
            - generic [ref=e70]: "I have an idea or a product and nothing is set up yet. Squads help me launch: store, first products, first campaign."
          - button "An existing business I already sell. Connect my store and inbox and let the squads take over the daily work." [ref=e71] [cursor=pointer]:
            - generic [ref=e76]: An existing business
            - generic [ref=e77]: I already sell. Connect my store and inbox and let the squads take over the daily work.
      - paragraph [ref=e78]: By continuing you agree to the [TERMS] and [PRIVACY POLICY].
```

# Test source

```ts
  8   | 	waitForHydration,
  9   | 	waitForScreenFonts,
  10  | } from "./support.ts";
  11  | 
  12  | test("sign-up starts at business type and pre-selects the design squads", async ({ page }) => {
  13  | 	await page.goto("/signup");
  14  | 	await expect(page).toHaveTitle("Create your business");
  15  | 	await expect(page.getByRole("heading", { name: "Where are you starting from?" })).toBeVisible();
  16  | 	await page.getByRole("button", { name: /A new business/ }).click();
  17  | 	await expect(page.getByText("Tell us about the business you want to start")).toBeVisible();
  18  | 	await expect(page.getByText("What will you sell, and to whom?")).toBeVisible();
  19  | 	await page.getByRole("button", { name: "Choose my squads" }).click();
  20  | 	await expect(page.getByText("3 squads and one master squad will be created.")).toBeVisible();
  21  | 	await expect(page.getByRole("button", { name: /Drafts your launch campaign/ })).toHaveAttribute(
  22  | 		"aria-pressed",
  23  | 		"true",
  24  | 	);
  25  | 	await expect(page.getByRole("button", { name: /Weekly profit summary/ })).toHaveAttribute("aria-pressed", "false");
  26  | 	await page.getByRole("button", { name: "Back" }).click();
  27  | 	await expect(page.getByRole("button", { name: "Choose my squads" })).toBeVisible();
  28  | 	await page.getByRole("button", { name: "Back" }).click();
  29  | 	await expect(page.getByRole("heading", { name: "Where are you starting from?" })).toBeVisible();
  30  | });
  31  | 
  32  | test("an existing business shows its fields and four starter squads", async ({ page }) => {
  33  | 	await page.goto("/signup");
  34  | 	await page.getByRole("button", { name: /An existing business/ }).click();
  35  | 	await expect(page.getByText("Tell us about your business")).toBeVisible();
  36  | 	await expect(page.getByText("Where do you sell today?")).toBeVisible();
  37  | 	await expect(page.getByLabel("Website")).toBeVisible();
  38  | 	const amazon = page.getByRole("button", { name: "Amazon" });
  39  | 	await expect(amazon).toHaveAttribute("aria-pressed", "false");
  40  | 	await amazon.click();
  41  | 	await expect(amazon).toHaveAttribute("aria-pressed", "true");
  42  | 	await amazon.click();
  43  | 	await expect(amazon).toHaveAttribute("aria-pressed", "false");
  44  | 	const under = page.getByRole("button", { name: "Under 100" });
  45  | 	const mid = page.getByRole("button", { name: "100 to 500" });
  46  | 	await expect(mid).toHaveAttribute("aria-pressed", "true");
  47  | 	await under.click();
  48  | 	await expect(under).toHaveAttribute("aria-pressed", "true");
  49  | 	await expect(mid).toHaveAttribute("aria-pressed", "false");
  50  | 	await page.getByRole("button", { name: "Choose my squads" }).click();
  51  | 	await expect(page.getByText("4 squads and one master squad will be created.")).toBeVisible();
  52  | 	await expect(page.getByRole("button", { name: /Syncs tracking and chases the maker/ })).toHaveAttribute(
  53  | 		"aria-pressed",
  54  | 		"true",
  55  | 	);
  56  | 	await expect(page.getByRole("button", { name: /Drafts your launch campaign/ })).toHaveCount(0);
  57  | 	await expect(page.getByRole("button", { name: /Watches ad spend and return/ })).toHaveAttribute(
  58  | 		"aria-pressed",
  59  | 		"false",
  60  | 	);
  61  | });
  62  | 
  63  | test("zero squads do not open the account form", async ({ page }) => {
  64  | 	await page.goto("/signup");
  65  | 	await page.getByRole("button", { name: /A new business/ }).click();
  66  | 	await page.getByRole("button", { name: "Choose my squads" }).click();
  67  | 	for (const name of [/Ready for your first order/, /Replies in your voice/, /Drafts your launch campaign/]) {
  68  | 		await page.getByRole("button", { name }).click();
  69  | 	}
  70  | 	await expect(page.getByText("Pick at least one squad to start.")).toBeVisible();
  71  | 	await page.getByRole("button", { name: "Create my workspace" }).click();
  72  | 	await expect(page.getByLabel("Email")).toHaveCount(0);
  73  | 	await expect(page).toHaveURL(/\/signup$/);
  74  | });
  75  | 
  76  | test("the account step reuses the sign-in fields and blocks empty input", async ({ page }) => {
  77  | 	await page.goto("/signup");
  78  | 	await page.getByRole("button", { name: /A new business/ }).click();
  79  | 	await page.getByRole("button", { name: "Choose my squads" }).click();
  80  | 	await page.getByRole("button", { name: "Create my workspace" }).click();
  81  | 	await expect(page.locator("ol li")).toHaveCount(3);
  82  | 	await expect(page.getByText("Business type", { exact: true })).toBeVisible();
  83  | 	await expect(page.locator("ol").getByText("Squads", { exact: true })).toBeVisible();
  84  | 	await expect(page.getByLabel("Email")).toHaveAttribute("placeholder", "you@company.com");
  85  | 	await expect(page.getByLabel("Password")).toHaveAttribute("placeholder", "Your password");
  86  | 	await page.getByRole("button", { name: "Create my workspace" }).click();
  87  | 	await expect(page.getByRole("alert")).toHaveText("Enter your email and password to sign in.");
  88  | 	await expect(page).toHaveURL(/\/signup$/);
  89  | 	await page.getByRole("button", { name: "Back" }).click();
  90  | 	await expect(page.getByText("3 squads and one master squad will be created.")).toBeVisible();
  91  | });
  92  | 
  93  | test("sign-up controls have labels", async ({ page }) => {
  94  | 	await page.goto("/signup");
  95  | 	await page.getByRole("button", { name: /A new business/ }).click();
  96  | 	await expectLabeledInputs(page);
  97  | 	await expectNamedButtons(page);
  98  | });
  99  | 
  100 | for (const viewport of viewports) {
  101 | 	test(`sign-up at ${viewport.name}`, async ({ page }) => {
  102 | 		await page.setViewportSize({ width: viewport.width, height: viewport.height });
  103 | 		await page.goto("/signup");
  104 | 		await waitForScreenFonts(page);
  105 | 		await waitForHydration(page);
  106 | 		await page.evaluate(() => document.fonts.ready);
  107 | 		await expectNoHorizontalScroll(page);
> 108 | 		await expect(page).toHaveScreenshot(`signup-${viewport.name}.png`, { fullPage: true });
      |                      ^ Error: expect(page).toHaveScreenshot(expected) failed
  109 | 	});
  110 | }
  111 | 
```