# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: local-frame.spec.ts >> the frame matches the macOS screenshot baselines
- Location: e2e/local-frame.spec.ts:289:1

# Error details

```
Error: A snapshot doesn't exist at /Users/moeghashim/.no-mistakes/worktrees/7fcac8a8339b/01M6EKR5EE3AQFM23MF7PE72ZF/e2e/frame-spec-ts-snapshots-frame-closed-1440.png, writing actual.
```

```
Error: A snapshot doesn't exist at /Users/moeghashim/.no-mistakes/worktrees/7fcac8a8339b/01M6EKR5EE3AQFM23MF7PE72ZF/e2e/frame-spec-ts-snapshots-frame-open-1440.png, writing actual.
```

```
Error: A snapshot doesn't exist at /Users/moeghashim/.no-mistakes/worktrees/7fcac8a8339b/01M6EKR5EE3AQFM23MF7PE72ZF/e2e/frame-spec-ts-snapshots-frame-closed-390.png, writing actual.
```

```
Error: A snapshot doesn't exist at /Users/moeghashim/.no-mistakes/worktrees/7fcac8a8339b/01M6EKR5EE3AQFM23MF7PE72ZF/e2e/frame-spec-ts-snapshots-frame-open-390.png, writing actual.
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - navigation "Workspace" [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]: M
      - generic [ref=e6]:
        - generic [ref=e7]: Master
        - generic [ref=e8]: Runs 5 squads · Demo store
    - button "Overview" [ref=e9] [cursor=pointer]
    - button "Chat with the master" [ref=e15] [cursor=pointer]
    - button "Squads" [ref=e18] [cursor=pointer]
    - button "Squad traffic" [ref=e23] [cursor=pointer]
    - button "Rules and limits" [ref=e29] [cursor=pointer]
    - generic [ref=e35]: Squads
    - generic [ref=e36]:
      - button "Orders Running" [ref=e37] [cursor=pointer]:
        - generic [ref=e39]: Orders
        - img "Running" [ref=e40]
      - button "Support Running" [ref=e41] [cursor=pointer]:
        - generic [ref=e43]: Support
        - img "Running" [ref=e44]
      - button "Marketing Running" [ref=e45] [cursor=pointer]:
        - generic [ref=e47]: Marketing
        - img "Running" [ref=e48]
      - button "Finance Running" [ref=e49] [cursor=pointer]:
        - generic [ref=e51]: Finance
        - img "Running" [ref=e52]
      - button "Inventory Paused" [ref=e53] [cursor=pointer]:
        - generic [ref=e55]: Inventory
        - img "Paused" [ref=e56]
    - generic [ref=e57]:
      - generic [ref=e58]: MG
      - generic [ref=e59]: Moe Ghashim
  - main [ref=e60]:
    - generic [ref=e62]:
      - generic [ref=e63]:
        - generic [ref=e64]:
          - heading "Good morning, Moe" [level=1] [ref=e65]
          - paragraph [ref=e66]: Last 7 days across the store and your squads. Figures are demo data.
          - paragraph [ref=e67]:
            - generic [ref=e68]: Mission
            - text: Reach $1M in annual sales with repeat customers by the end of 2027.
        - generic [ref=e69]:
          - generic [ref=e70]: Demo data
          - generic [ref=e71]: 4 of 5 squads online
      - region "Key numbers" [ref=e72]:
        - generic [ref=e73]:
          - generic [ref=e74]:
            - generic [ref=e75]: Revenue
            - generic [ref=e76]: $8,420
            - generic [ref=e77]: +12% vs last week
          - generic [ref=e78]:
            - generic [ref=e79]: Orders
            - generic [ref=e80]: "186"
            - generic [ref=e81]: +8% vs last week
          - generic [ref=e82]:
            - generic [ref=e83]: Average order
            - generic [ref=e84]: $45.27
            - generic [ref=e85]: +4% vs last week
          - generic [ref=e86]:
            - generic [ref=e87]: Profit margin
            - generic [ref=e88]: 31%
            - generic [ref=e89]: −1 pt vs last week
          - generic [ref=e90]:
            - generic [ref=e91]: Tasks done by squads
            - generic [ref=e92]: "331"
            - generic [ref=e93]: This week
          - generic [ref=e94]:
            - generic [ref=e95]: Hours saved
            - generic [ref=e96]: 34h
            - generic [ref=e97]: This week
      - generic [ref=e98]:
        - region "Revenue" [ref=e99]:
          - generic [ref=e100]:
            - heading "Revenue, last 14 days" [level=2] [ref=e101]
            - generic [ref=e102]: Hover a bar for the day's total
          - generic [ref=e104]:
            - 'generic "Oct 14: $980" [ref=e105]'
            - 'generic "Oct 15: $1,040" [ref=e106]'
            - 'generic "Oct 16: $1,020" [ref=e107]'
            - 'generic "Oct 17: $1,110" [ref=e108]'
            - 'generic "Oct 18: $1,060" [ref=e109]'
            - 'generic "Oct 19: $1,150" [ref=e110]'
            - 'generic "Oct 20: $1,160" [ref=e111]'
            - 'generic "Oct 21: $1,010" [ref=e112]'
            - 'generic "Oct 22: $1,120" [ref=e113]'
            - 'generic "Oct 23: $1,090" [ref=e114]'
            - 'generic "Oct 24: $1,250" [ref=e115]'
            - 'generic "Oct 25: $1,180" [ref=e116]'
            - 'generic "Oct 26: $1,330" [ref=e117]'
            - 'generic "Oct 27: $1,440" [ref=e118]'
          - generic [ref=e120]:
            - generic [ref=e121]: "14"
            - generic [ref=e122]: "15"
            - generic [ref=e123]: "16"
            - generic [ref=e124]: "17"
            - generic [ref=e125]: "18"
            - generic [ref=e126]: "19"
            - generic [ref=e127]: "20"
            - generic [ref=e128]: "21"
            - generic [ref=e129]: "22"
            - generic [ref=e130]: "23"
            - generic [ref=e131]: "24"
            - generic [ref=e132]: "25"
            - generic [ref=e133]: "26"
            - generic [ref=e134]: "27"
          - generic [ref=e135]:
            - generic [ref=e136]: Previous week
            - generic [ref=e138]: This week
        - region "Needs you" [ref=e140]:
          - generic [ref=e141]:
            - heading "Needs your approval" [level=2] [ref=e142]
            - generic [ref=e143]: "4"
          - generic [ref=e145]:
            - generic [ref=e146]:
              - generic [ref=e148]: Inventory squad
              - generic [ref=e149]: Mission
            - generic [ref=e150]: Proposed mission
            - generic [ref=e151]: Never run out of a top-20 product and keep stock under 30 days of cover.
            - generic [ref=e153]:
              - generic [ref=e154]: "Stock-outs: 0"
              - generic [ref=e155]: "Days of stock: under 30"
              - generic [ref=e156]: "Reorders approved in time: 100%"
            - generic [ref=e158]:
              - button "Approve mission" [ref=e159] [cursor=pointer]
              - button "Ask for another" [ref=e160] [cursor=pointer]
          - generic [ref=e161]:
            - generic [ref=e162]:
              - generic [ref=e163]:
                - generic [ref=e165]: Support squad
                - generic [ref=e166]: $42
              - generic [ref=e167]: "Refund $42 on #A-1012"
              - generic [ref=e168]: Print arrived creased; photo attached. Second refund for this customer this month.
              - generic [ref=e169]:
                - button "Approve" [ref=e170] [cursor=pointer]
                - button "Decline" [ref=e171] [cursor=pointer]
            - generic [ref=e172]:
              - generic [ref=e173]:
                - generic [ref=e175]: Marketing squad
                - generic [ref=e176]: +$20/day
              - generic [ref=e177]: Raise prints ad set to $60 a day
              - generic [ref=e178]: Return on ad spend has been 3.4 for 7 days. Adds about $140 a week.
              - generic [ref=e179]:
                - button "Approve" [ref=e180] [cursor=pointer]
                - button "Decline" [ref=e181] [cursor=pointer]
            - generic [ref=e182]:
              - generic [ref=e183]:
                - generic [ref=e185]: Inventory squad
                - generic [ref=e186]: $610
              - generic [ref=e187]: Reorder 50 blank hoodies
              - generic [ref=e188]: Black hoodie M is down to 6. Usual supplier, 5-day delivery.
              - generic [ref=e189]:
                - button "Approve" [ref=e190] [cursor=pointer]
                - button "Decline" [ref=e191] [cursor=pointer]
      - region "Agents at a glance" [ref=e192]:
        - generic [ref=e193]:
          - heading "Squads and their missions" [level=2] [ref=e194]
          - button "See squad traffic" [ref=e195] [cursor=pointer]
        - generic [ref=e197]:
          - 'button "Orders Fulfilment and tracking Added tracking LI400083615LT to #A-1007 Ship every order within 24 hours and keep the customer informed. 72% done 142 tasks 98% success 11.5h saved" [ref=e198] [cursor=pointer]':
            - generic [ref=e204]:
              - generic [ref=e205]: Orders
              - generic [ref=e206]: Fulfilment and tracking
            - generic [ref=e207]: "Added tracking LI400083615LT to #A-1007"
            - generic [ref=e208]:
              - generic [ref=e209]: Ship every order within 24 hours and keep the customer informed.
              - generic [ref=e210]: 72% done
            - generic [ref=e214]:
              - generic [ref=e215]:
                - strong [ref=e216]: "142"
                - text: tasks
              - generic [ref=e217]:
                - strong [ref=e218]: 98%
                - text: success
              - generic [ref=e219]:
                - strong [ref=e220]: 11.5h
                - text: saved
          - 'button "Support Customer inbox and refunds Asked for tracking on #A-1007 for a customer Answer every customer within an hour and keep satisfaction above 4.5. 81% done 96 tasks 94% success 9h saved" [ref=e221] [cursor=pointer]':
            - generic [ref=e227]:
              - generic [ref=e228]: Support
              - generic [ref=e229]: Customer inbox and refunds
            - generic [ref=e230]: "Asked for tracking on #A-1007 for a customer"
            - generic [ref=e231]:
              - generic [ref=e232]: Answer every customer within an hour and keep satisfaction above 4.5.
              - generic [ref=e233]: 81% done
            - generic [ref=e237]:
              - generic [ref=e238]:
                - strong [ref=e239]: "96"
                - text: tasks
              - generic [ref=e240]:
                - strong [ref=e241]: 94%
                - text: success
              - generic [ref=e242]:
                - strong [ref=e243]: 9h
                - text: saved
          - button "Marketing Ads, social and email Asked to raise the prints ad set to $60 a day Bring in repeat customers at a return above 3× on every dollar spent. 64% done 38 tasks 91% success 6h saved" [ref=e244] [cursor=pointer]:
            - generic [ref=e250]:
              - generic [ref=e251]: Marketing
              - generic [ref=e252]: Ads, social and email
            - generic [ref=e253]: Asked to raise the prints ad set to $60 a day
            - generic [ref=e254]:
              - generic [ref=e255]: Bring in repeat customers at a return above 3× on every dollar spent.
              - generic [ref=e256]: 64% done
            - generic [ref=e260]:
              - generic [ref=e261]:
                - strong [ref=e262]: "38"
                - text: tasks
              - generic [ref=e263]:
                - strong [ref=e264]: 91%
                - text: success
              - generic [ref=e265]:
                - strong [ref=e266]: 6h
                - text: saved
          - button "Finance Payouts, costs and profit Sent the weekly profit summary Keep profit margin above 30% and every bill matched within a week. 90% done 24 tasks 100% success 4h saved" [ref=e267] [cursor=pointer]:
            - generic [ref=e273]:
              - generic [ref=e274]: Finance
              - generic [ref=e275]: Payouts, costs and profit
            - generic [ref=e276]: Sent the weekly profit summary
            - generic [ref=e277]:
              - generic [ref=e278]: Keep profit margin above 30% and every bill matched within a week.
              - generic [ref=e279]: 90% done
            - generic [ref=e283]:
              - generic [ref=e284]:
                - strong [ref=e285]: "24"
                - text: tasks
              - generic [ref=e286]:
                - strong [ref=e287]: 100%
                - text: success
              - generic [ref=e288]:
                - strong [ref=e289]: 4h
                - text: saved
          - button "Inventory Stock and suppliers Drafted a reorder of 50 blank hoodies Mission pending. Master has proposed one; approve it in the inbox. Pending 31 tasks 97% success 3.5h saved" [ref=e290] [cursor=pointer]:
            - generic [ref=e296]:
              - generic [ref=e297]: Inventory
              - generic [ref=e298]: Stock and suppliers
            - generic [ref=e299]: Drafted a reorder of 50 blank hoodies
            - generic [ref=e300]:
              - generic [ref=e301]: Mission pending. Master has proposed one; approve it in the inbox.
              - generic [ref=e302]: Pending
            - generic [ref=e305]:
              - generic [ref=e306]:
                - strong [ref=e307]: "31"
                - text: tasks
              - generic [ref=e308]:
                - strong [ref=e309]: 97%
                - text: success
              - generic [ref=e310]:
                - strong [ref=e311]: 3.5h
                - text: saved
  - button "M Ask Master 4" [active] [ref=e314] [cursor=pointer]:
    - generic [ref=e315]: M
    - generic [ref=e316]: Ask Master
    - generic [ref=e317]: "4"
```

# Test source

```ts
  199 | 	}
  200 | });
  201 | 
  202 | test("the keyboard reaches the dock, shows the focus ring, and Enter sends", async ({
  203 | 	page,
  204 | 	workspaceUser,
  205 | 	accountId,
  206 | }) => {
  207 | 	test.setTimeout(90_000);
  208 | 	await openWorkspace(page, workspaceUser);
  209 | 	await page.getByRole("button", { name: "Ask Master" }).click();
  210 | 	await expect(page.getByRole("button", { name: "Hide chat" })).toBeFocused();
  211 | 	await page.keyboard.press("Shift+Tab");
  212 | 	const send = page.getByRole("button", { name: "Send" });
  213 | 	await expect(send).toBeFocused();
  214 | 	await expect(send).toHaveCSS("outline-color", "rgb(1, 105, 204)");
  215 | 	await expect(send).toHaveCSS("outline-width", "2px");
  216 | 	await page.keyboard.press("Shift+Tab");
  217 | 	const input = page.locator("#dock-input");
  218 | 	await expect(input).toBeFocused();
  219 | 	await expect(input).toHaveCSS("outline-offset", "4px");
  220 | 	await input.fill("Hello there");
  221 | 	await input.press("Enter");
  222 | 	await expect(page.getByText(noAgent)).toBeVisible({ timeout: dockReplyTimeout });
  223 | 	expect(await generatedEvents(accountId)).toEqual([]);
  224 | });
  225 | 
  226 | test("the message list focus ring is 2 px blue with a 2 px offset", async ({ page, workspaceUser }) => {
  227 | 	await openWorkspace(page, workspaceUser);
  228 | 	await page.getByRole("button", { name: "Ask Master" }).click();
  229 | 	await page.getByRole("button", { name: "Close chat" }).focus();
  230 | 	await page.keyboard.press("Tab");
  231 | 	const ring = await page.evaluate(() => {
  232 | 		const element = document.activeElement;
  233 | 		if (!element) return { tag: "", width: "", offset: "", color: "" };
  234 | 		const style = getComputedStyle(element);
  235 | 		return {
  236 | 			tag: element.tagName,
  237 | 			width: style.outlineWidth,
  238 | 			offset: style.outlineOffset,
  239 | 			color: style.outlineColor,
  240 | 		};
  241 | 	});
  242 | 	expect(ring).toEqual({ tag: "DIV", width: "2px", offset: "2px", color: "rgb(1, 105, 204)" });
  243 | });
  244 | 
  245 | test("the side-by-side evidence shows the design and the build", async ({ page, workspaceUser, accountId }) => {
  246 | 	void accountId;
  247 | 	test.skip(
  248 | 		process.env.FRAME_EVIDENCE !== "1" || process.platform !== "darwin",
  249 | 		"Side-by-side evidence is captured once on macOS.",
  250 | 	);
  251 | 	const dir = ".no-mistakes/evidence/02-frame";
  252 | 	mkdirSync(dir, { recursive: true });
  253 | 	await openWorkspace(page, workspaceUser);
  254 | 	for (const viewport of viewports) {
  255 | 		await page.setViewportSize({ width: viewport.width, height: viewport.height });
  256 | 		await waitForScreenFonts(page);
  257 | 		const closedBuild = await shot(page);
  258 | 		const closedDesign = await designShot(page, viewport.width, viewport.height, false);
  259 | 		await stitch(page, closedDesign, closedBuild, `${dir}/side-by-side-${viewport.name}.png`);
  260 | 		await page.getByRole("button", { name: "Ask Master" }).click();
  261 | 		await waitForScreenFonts(page);
  262 | 		const openBuild = await shot(page);
  263 | 		const openDesign = await designShot(page, viewport.width, viewport.height, true);
  264 | 		await stitch(page, openDesign, openBuild, `${dir}/side-by-side-open-${viewport.name}.png`);
  265 | 		await page.getByRole("button", { name: "Hide chat" }).click();
  266 | 	}
  267 | });
  268 | 
  269 | test("the frame boxes match the rendered design at 1440 and 390", async ({ page, workspaceUser }) => {
  270 | 	await openWorkspace(page, workspaceUser);
  271 | 	await page.getByRole("button", { name: "Ask Master" }).click();
  272 | 	for (const viewport of viewports) {
  273 | 		await page.setViewportSize({ width: viewport.width, height: viewport.height });
  274 | 		await waitForScreenFonts(page);
  275 | 		const designPage = await openDesignFrame(page, viewport.width, viewport.height, true);
  276 | 		try {
  277 | 			await waitForScreenFonts(designPage);
  278 | 			const design = await measureFrame(designPage);
  279 | 			const built = await measureFrame(page);
  280 | 			expectFrameBoxes(built, design, viewport.name);
  281 | 			await expectTagShells(designPage, viewport.name);
  282 | 			expectMessageHeights(built, design, viewport.name);
  283 | 		} finally {
  284 | 			await designPage.close();
  285 | 		}
  286 | 	}
  287 | });
  288 | 
  289 | test("the frame matches the macOS screenshot baselines", async ({ page, workspaceUser, accountId }) => {
  290 | 	void accountId;
  291 | 	skipUnlessMacScreenshot();
  292 | 	await openWorkspace(page, workspaceUser);
  293 | 	for (const viewport of viewports) {
  294 | 		await page.setViewportSize({ width: viewport.width, height: viewport.height });
  295 | 		await waitForScreenFonts(page);
  296 | 		await expect(page).toHaveScreenshot(`frame.spec.ts-snapshots/frame-closed-${viewport.name}.png`, { fullPage: true });
  297 | 		await page.getByRole("button", { name: "Ask Master" }).click();
  298 | 		await waitForScreenFonts(page);
> 299 | 		await expect(page).toHaveScreenshot(`frame.spec.ts-snapshots/frame-open-${viewport.name}.png`, { fullPage: true });
      |   ^ Error: A snapshot doesn't exist at /Users/moeghashim/.no-mistakes/worktrees/7fcac8a8339b/01M6EKR5EE3AQFM23MF7PE72ZF/e2e/frame-spec-ts-snapshots-frame-open-390.png, writing actual.
  300 | 		await page.getByRole("button", { name: "Hide chat" }).click();
  301 | 	}
  302 | });
  303 | 
  304 | async function expectSame(page: Page, dockOpen: boolean) {
  305 | 	const design = await designParts(page, dockOpen);
  306 | 	const builtSide = await sectionInventory(page, "[data-if='notAdmin']");
  307 | 	const builtDock = await sectionInventory(page, "[data-if='showDock']");
  308 | 	expectMatch(design.side, builtSide);
  309 | 	expectMatch(design.dock, builtDock);
  310 | }
  311 | 
  312 | function expectMatch(
  313 | 	design: {
  314 | 		texts: string[];
  315 | 		handlers: { tag: string; event: string; handler: string }[];
  316 | 		loops: unknown[];
  317 | 		links: unknown[];
  318 | 	},
  319 | 	built: {
  320 | 		texts: string[];
  321 | 		handlers: { tag: string; event: string; handler: string }[];
  322 | 		loops: unknown[];
  323 | 		links: unknown[];
  324 | 	},
  325 | ) {
  326 | 	const diff = compareInventory(design, built);
  327 | 	expect(diff.extraTexts).toEqual([]);
  328 | 	expect(diff.missingTexts).toEqual([]);
  329 | 	expect(diff.extraHandlers).toEqual([]);
  330 | 	expect(diff.missingHandlers).toEqual([]);
  331 | 	expect(diff.extraLoops).toEqual([]);
  332 | 	expect(diff.missingLoops).toEqual([]);
  333 | 	expect(diff.extraLinks).toEqual([]);
  334 | 	expect(diff.missingLinks).toEqual([]);
  335 | 	expect(identities(built.handlers)).toEqual(identities(design.handlers));
  336 | }
  337 | 
  338 | function identities(handlers: { tag: string; event: string; handler: string }[]) {
  339 | 	return handlers.map((handler) => `${handler.tag}|${handler.event}|${handler.handler}`).sort();
  340 | }
  341 | 
  342 | async function shot(page: Page) {
  343 | 	return page.screenshot({ fullPage: true, animations: "disabled", caret: "hide", scale: "css" });
  344 | }
  345 | 
  346 | async function openDesignFrame(page: Page, width: number, height: number, dockOpen: boolean) {
  347 | 	const canvas = await page.context().newPage();
  348 | 	await installLocalFonts(canvas);
  349 | 	await canvas.setViewportSize({ width, height });
  350 | 	const body = await renderDesignMarkup(canvas, readInventory("Main"), { view: "overview", dockOpen });
  351 | 	const source = readFileSync(new URL("../design/Main.dc.html", import.meta.url), "utf8");
  352 | 	const css = source.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
  353 | 	await canvas.setContent(
  354 | 		`<!doctype html><html lang="en"><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"><style>${css}x-dc{display:contents}</style></head><body>${body}</body></html>`,
  355 | 	);
  356 | 	await canvas.locator("[data-handler='goAdmin']").evaluate((element) => element.remove());
  357 | 	await canvas.locator("main").evaluate((element) => element.replaceChildren());
  358 | 	// The reference renderer sets display:contents on every sc-for and sc-if, including later copies.
  359 | 	// Marked nodes get the same display here so a missed wrapper cannot grow a box.
  360 | 	await canvas.evaluate(() => {
  361 | 		for (const node of document.querySelectorAll("[data-loop], [data-if]")) {
  362 | 			if (node instanceof HTMLElement) node.style.setProperty("display", "contents");
  363 | 		}
  364 | 	});
  365 | 	await waitForScreenFonts(canvas);
  366 | 	return canvas;
  367 | }
  368 | 
  369 | async function designShot(page: Page, width: number, height: number, dockOpen: boolean) {
  370 | 	const canvas = await openDesignFrame(page, width, height, dockOpen);
  371 | 	try {
  372 | 		return await shot(canvas);
  373 | 	} finally {
  374 | 		await canvas.close();
  375 | 	}
  376 | }
  377 | 
  378 | type FrameBoxes = Awaited<ReturnType<typeof measureFrame>>;
  379 | 
  380 | function expectNear(actual: number, expected: number, label: string) {
  381 | 	expect(Math.abs(actual - expected), `${label}: build ${actual}, design ${expected}`).toBeLessThanOrEqual(0.5);
  382 | }
  383 | 
  384 | function expectFrameBoxes(built: FrameBoxes, design: FrameBoxes, name: string) {
  385 | 	expectPanel(built, design, name);
  386 | 	expectAgentRows(built, design, name);
  387 | 	expectAgentGaps(built.agentGaps, design.agentGaps, name);
  388 | 	expectMessageGaps(built.messageGaps, design.messageGaps, name);
  389 | 	expectChipRow(built, design, name);
  390 | }
  391 | 
  392 | function expectPanel(built: FrameBoxes, design: FrameBoxes, name: string) {
  393 | 	expect(design.panel, `${name} design panel`).not.toBeNull();
  394 | 	expect(built.panel, `${name} build panel`).not.toBeNull();
  395 | 	expectNear(built.panel?.width ?? 0, design.panel?.width ?? 0, `${name} panel width`);
  396 | 	expectNear(built.panel?.x ?? 0, design.panel?.x ?? 0, `${name} panel x`);
  397 | }
  398 | 
  399 | function expectAgentRows(built: FrameBoxes, design: FrameBoxes, name: string) {
```