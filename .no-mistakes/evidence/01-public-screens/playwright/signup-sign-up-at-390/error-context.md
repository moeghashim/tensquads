# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: signup.spec.ts >> sign-up at 390
- Location: e2e/signup.spec.ts:100:2

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
  5   | 	expectNoHorizontalScroll,
  6   | 	test,
  7   | 	viewports,
  8   | 	waitForScreenFonts,
  9   | } from "./support.ts";
  10  | 
  11  | test("sign-up starts at business type and pre-selects the design squads", async ({ page }) => {
  12  | 	await page.goto("/signup");
  13  | 	await expect(page).toHaveTitle("Create your business");
  14  | 	await expect(page.getByRole("heading", { name: "Where are you starting from?" })).toBeVisible();
  15  | 	await page.getByRole("button", { name: /A new business/ }).click();
  16  | 	await expect(page.getByText("Tell us about the business you want to start")).toBeVisible();
  17  | 	await expect(page.getByText("What will you sell, and to whom?")).toBeVisible();
  18  | 	await page.getByRole("button", { name: "Choose my squads" }).click();
  19  | 	await expect(page.getByText("3 squads and one master squad will be created.")).toBeVisible();
  20  | 	await expect(page.getByRole("button", { name: /Drafts your launch campaign/ })).toHaveAttribute(
  21  | 		"aria-pressed",
  22  | 		"true",
  23  | 	);
  24  | 	await expect(page.getByRole("button", { name: /Weekly profit summary/ })).toHaveAttribute("aria-pressed", "false");
  25  | 	await page.getByRole("button", { name: "Back" }).click();
  26  | 	await expect(page.getByRole("button", { name: "Choose my squads" })).toBeVisible();
  27  | 	await page.getByRole("button", { name: "Back" }).click();
  28  | 	await expect(page.getByRole("heading", { name: "Where are you starting from?" })).toBeVisible();
  29  | });
  30  | 
  31  | test("an existing business shows its fields and four starter squads", async ({ page }) => {
  32  | 	await page.goto("/signup");
  33  | 	await page.getByRole("button", { name: /An existing business/ }).click();
  34  | 	await expect(page.getByText("Tell us about your business")).toBeVisible();
  35  | 	await expect(page.getByText("Where do you sell today?")).toBeVisible();
  36  | 	await expect(page.getByLabel("Website")).toBeVisible();
  37  | 	const amazon = page.getByRole("button", { name: "Amazon" });
  38  | 	await expect(amazon).toHaveAttribute("aria-pressed", "false");
  39  | 	await amazon.click();
  40  | 	await expect(amazon).toHaveAttribute("aria-pressed", "true");
  41  | 	await amazon.click();
  42  | 	await expect(amazon).toHaveAttribute("aria-pressed", "false");
  43  | 	const under = page.getByRole("button", { name: "Under 100" });
  44  | 	const mid = page.getByRole("button", { name: "100 to 500" });
  45  | 	await expect(mid).toHaveAttribute("aria-pressed", "true");
  46  | 	await under.click();
  47  | 	await expect(under).toHaveAttribute("aria-pressed", "true");
  48  | 	await expect(mid).toHaveAttribute("aria-pressed", "false");
  49  | 	await page.getByRole("button", { name: "Choose my squads" }).click();
  50  | 	await expect(page.getByText("4 squads and one master squad will be created.")).toBeVisible();
  51  | 	await expect(page.getByRole("button", { name: /Syncs tracking and chases the maker/ })).toHaveAttribute(
  52  | 		"aria-pressed",
  53  | 		"true",
  54  | 	);
  55  | 	await expect(page.getByRole("button", { name: /Drafts your launch campaign/ })).toHaveCount(0);
  56  | 	await expect(page.getByRole("button", { name: /Watches ad spend and return/ })).toHaveAttribute(
  57  | 		"aria-pressed",
  58  | 		"false",
  59  | 	);
  60  | });
  61  | 
  62  | test("zero squads do not open the account form", async ({ page }) => {
  63  | 	await page.goto("/signup");
  64  | 	await page.getByRole("button", { name: /A new business/ }).click();
  65  | 	await page.getByRole("button", { name: "Choose my squads" }).click();
  66  | 	for (const name of [/Ready for your first order/, /Replies in your voice/, /Drafts your launch campaign/]) {
  67  | 		await page.getByRole("button", { name }).click();
  68  | 	}
  69  | 	await expect(page.getByText("Pick at least one squad to start.")).toBeVisible();
  70  | 	await page.getByRole("button", { name: "Create my workspace" }).click();
  71  | 	await expect(page.getByLabel("Email")).toHaveCount(0);
  72  | 	await expect(page).toHaveURL(/\/signup$/);
  73  | });
  74  | 
  75  | test("the account step reuses the sign-in fields and blocks empty input", async ({ page }) => {
  76  | 	await page.goto("/signup");
  77  | 	await page.getByRole("button", { name: /A new business/ }).click();
  78  | 	await page.getByRole("button", { name: "Choose my squads" }).click();
  79  | 	await page.getByRole("button", { name: "Create my workspace" }).click();
  80  | 	await expect(page.locator("ol li")).toHaveCount(3);
  81  | 	await expect(page.getByText("Business type", { exact: true })).toBeVisible();
  82  | 	await expect(page.locator("ol").getByText("Squads", { exact: true })).toBeVisible();
  83  | 	await expect(page.getByLabel("Email")).toHaveAttribute("placeholder", "you@company.com");
  84  | 	await expect(page.getByLabel("Password")).toHaveAttribute("placeholder", "Your password");
  85  | 	await page.getByRole("button", { name: "Create my workspace" }).click();
  86  | 	await expect(page.getByRole("alert")).toHaveText("Enter your email and password to sign in.");
  87  | 	await expect(page).toHaveURL(/\/signup$/);
  88  | 	await page.getByRole("button", { name: "Back" }).click();
  89  | 	await expect(page.getByText("3 squads and one master squad will be created.")).toBeVisible();
  90  | });
  91  | 
  92  | test("sign-up controls have labels", async ({ page }) => {
  93  | 	await page.goto("/signup");
  94  | 	await page.getByRole("button", { name: /A new business/ }).click();
  95  | 	await expectLabeledInputs(page);
  96  | 	await expectNamedButtons(page);
  97  | });
  98  | 
  99  | for (const viewport of viewports) {
  100 | 	test(`sign-up at ${viewport.name}`, async ({ page }) => {
  101 | 		await page.setViewportSize({ width: viewport.width, height: viewport.height });
  102 | 		await page.goto("/signup");
  103 | 		await waitForScreenFonts(page);
  104 | 		await expectNoHorizontalScroll(page);
> 105 | 		await expect(page).toHaveScreenshot(`signup-${viewport.name}.png`, { fullPage: true });
      |                      ^ Error: expect(page).toHaveScreenshot(expected) failed
  106 | 	});
  107 | }
  108 | 
```