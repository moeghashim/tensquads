# Product validation at 681a9d7

Baseline supplied by executor: npm ci && npm test passed.

The real TanStack Start app ran at http://127.0.0.1:3107 using a disposable Vite configuration. Only the Clerk identity boundary and database connection were substituted: a fixed local identity and an in-memory PGlite database with the real schema, migration, seed, repositories, and kernel. The routes, route loaders, server functions, UI, provider, queue, deadlines, and message handling were unchanged. No real accounts or shared database were used. This validates workspace behavior, not Clerk sign-in or Neon transport.

The browser scenarios copy existing e2e/overview.spec.ts behavior tests into the disposable harness, replacing only imports, fixture setup, local URL, and evidence destinations. Additional tests drive real 31-second delayed frame responses and older/equal client timestamps. The local server and temporary files were removed after testing. Harness files are retained here for reproduction.

Initial runner errors were setup problems: localhost resolved to a different IPv6 listener, so all requests were confined to 127.0.0.1:3107; the copied design helper needed its font path adjusted to e2e/fonts. Affected checks were rerun successfully. recovery-results.json records the font-path failure; boundaries-results.json records its successful rerun. No product code was changed.

## Latest browser outcomes

- PASS: the overview shows the greeting, six tiles, fourteen bars, the inbox and five cards (browser-results.json)
- PASS: the tile shows the computed 331 and the pill shows 4 of 5 squads online (browser-results.json)
- PASS: a held Approve changes the card and the badge at the click (browser-results.json)
- PASS: a held Decline changes the card and the badge at the click (browser-results.json)
- PASS: a held Approve mission changes the card and the badge at the click (browser-results.json)
- PASS: a held Ask for another changes the card and the badge at the click (browser-results.json)
- PASS: a second card is sent after the first, in click order (browser-results.json)
- PASS: queued cards and counts survive leaving and returning to overview (browser-results.json)
- PASS: navigation frame reads update the count after another tab decides (browser-results.json)
- PASS: a rejected decision restores the badge after leaving overview (browser-results.json)
- PASS: navigation frame reads update the count after another tab declines (browser-results.json)
- PASS: a held dock begin keeps the server count on traffic (final-visual-results.json)
- PASS: a held chat finish keeps the server count on traffic (final-visual-results.json)
- PASS: a double click approves once and the badge changes at the click (browser-results.json)
- PASS: a failed write restores the server and the queued card still sends (browser-results.json)
- PASS: an empty inbox shows the nothing waiting text and no badge (recovery-results.json)
- PASS: ask for another shows the revising text and lowers the count (recovery-results.json)
- PASS: the overview boxes match the rendered design at 1440 and 390 (boundaries-results.json)
- PASS: the overview has no accessibility violations (recovery-results.json)
- PASS: the overview matches the macOS screenshot baselines (recovery-results.json)
- PASS: a frame arriving after the 30 second refresh bound restores Traffic (recovery-results.json)
- PASS: a frame arriving after the 30 second refresh bound restores Traffic and preserves another in-flight card (recovery-results.json)
- PASS: a frame started before the decision timestamp cannot replace its count (boundaries-results.json)
- PASS: a frame started at the decision timestamp cannot replace its count (boundaries-results.json)
- PASS: the side-by-side evidence shows the design and the build (final-visual-results.json)
- PASS: a mission frame arriving after the 30 second refresh bound restores Traffic (final-visual-results.json)

## Additional executed checks

- node --experimental-strip-types --test apps/web/src/screens/overview/actions.test.ts apps/web/src/workspace/approval-count.test.ts: passed. These are supplemental unit checks, not live scenarios.
- node --experimental-strip-types --test packages/adapters/test/approval-deadline.test.ts: passed, including a real elapsed transaction deadline and rollback. These are supplemental adapter checks, not browser scenarios.
- git log trailer inspection: each commit in the base-to-target range has Signed-off-by: Moe Ghashim <mohanadgh@gmail.com>.
- node scripts/design-check.mjs: design/ matches the canvas.

## Reproduction

Copy harness/*.ts to .local-test/, except harness/vite.config.ts, which goes to apps/web/.local-test-vite.ts. Start from apps/web with TEST_DATABASE_URL=local-isolated node ../../node_modules/vite/bin/vite.js --config .local-test-vite.ts --host 127.0.0.1 --port 3107. From the repository root, set LOCAL_EVIDENCE to an evidence directory and run npx playwright test --config .local-test/playwright.config.ts with the selected titles in the JSON reports. The harness also contains unselected copies of tests that require external credentials; do not run every copied test. Use OVERVIEW_EVIDENCE=1 for the side-by-side capture.
