Homepage live validation

Real local Vite/Cloudflare development runtime, test adapters, no account or database. Real Playwright Chromium rendering and input. Only request Host headers were rewritten; responses came from the running product. Pinned repository font files supplied Google Fonts assets.

Observed results:
- 10squads.com and www.10squads.com rendered the current homepage. The workers.dev host rendered the approval-moment homepage. Localhost retained the current homepage.
- Motion-enabled first-frame card opacities were all 0; Pisa subsequently approved and the count changed to 3.
- Reduced motion displayed all cards immediately and subsequently approved Pisa. With JavaScript disabled all cards were visible.
- Repeated typing and business-type changes every 300 ms preserved arrival and approval progress with both motion preferences. The limits panel stayed filled after subsequent input.
- Blocking external client scripts prevented hydration. Cards started hidden and became visible after the six-second fallback. See fallback.png.
- Business type changed placeholder and examples; selecting an example filled the textbox. Squadmate details appeared on focus and hover. Limits filled on entering the viewport. Sign in navigated to /signin; Build my squad, every Start free link, and Talk to us navigated to /signup.
- Clicking the decorative Approve and Decline pills left the sample cards and count unchanged.
- Every homepage focusable control was reached with Tab. Existing focus-ring, accessible-name, label, forbidden-copy and horizontal-overflow checks passed.
- Both screenshot baselines passed, including the corrected 30px announcement badge. Fresh built/design screenshots are provided at 1440px and 390px. All twelve major layout rectangles matched exactly between the live page and rendered approved design.
- The live rendered homepage inventory matched the approved design's text, links, handlers and loops.

Commands:
1. npx --no-install playwright test e2e/home-v2.spec.ts --project app --workers=2 --output <evidence>/playwright : 11 passed.
2. npx --no-install playwright test e2e/phase-home-v2.spec.ts e2e/inventory.spec.ts --grep 'reviewer visual|blocked hydration|every start link|home-v2 inventory' --project app --workers=2 --output <evidence>/extra-playwright : four passed; reference-page viewport setup failed for mobile.
3. Corrected the disposable reference page to explicitly use its requested viewport and reduced-motion preference, then reran both visual comparisons: two passed.
4. npx --no-install playwright test e2e/phase-home-v2.spec.ts --grep 'local default' --project app --workers=1 --output <evidence>/keyboard-playwright : passed.

The supplementary driver is preserved beside this report; it ran from e2e/ and was removed from the worktree after use. Local generated .dev.vars was removed. Existing dependencies and pre-existing build/runtime directories were retained.

The outer executor reported npm ci && npm test failed before this phase. That broad command was not rerun because this phase explicitly prohibits the complete suite. Its previously declined failure was not changed or re-raised. This result covers the changed homepage's live behavior only; CI remains owned by the outer executor.
