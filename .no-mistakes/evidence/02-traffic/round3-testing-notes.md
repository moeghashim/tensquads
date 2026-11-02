# Traffic live validation, round 3

Target b9677965f0bdfc9f64e58e47af2b61625ed16f23.

The supplied baseline `npm ci && npm test` passed. It was not repeated. This phase ran only focused traffic tests and real-browser checks. No lint, static analysis, full suite, make verify, deployment, push, PR, or CI phase was run.

The actual TanStack app ran on localhost:3000. A disposable Vite configuration supplied a fixed test identity and an in-memory PGlite PostgreSQL connection. Real migrations, design seeds, Drizzle repositories and transactions, Kernel, Bus plug-in, server functions, routes, provider, live control, and traffic screen ran unchanged. No real credentials or shared data were used. Clerk sign-in, Neon network transport, and Cloudflare hosting were outside this screen test. Chrome DevTools MCP was unavailable; repository-local Playwright drove isolated Chromium instead.

Commands:
- `node scripts/design-check.mjs`
- `node --experimental-strip-types --test scripts/test/traffic-live.test.mjs packages/adapters/test/traffic.test.ts`
- From apps/web: `TEST_DATABASE_URL=pglite-local ../../node_modules/.bin/vite --config vite.validation.config.ts --port 3000`
- `TRAFFIC_EVIDENCE=1 node_modules/.bin/playwright test --config .traffic-validation/playwright.config.ts`
- `node_modules/.bin/playwright test --config .traffic-validation/refresh.config.ts`
- `node_modules/.bin/playwright test --config .traffic-validation/boundary.config.ts`
- `node_modules/.bin/playwright test --config .traffic-validation/console.config.ts`

All focused tests and live checks passed. The copied traffic spec retains the current behavior assertions and unchanged screenshot thresholds/baselines; only authentication/database setup helpers and evidence destinations differ. Missing selected-id coverage navigates away, deletes that record in the disposable database, then returns through the sidebar without reload. The inspector chooses the last remaining event, and no console error occurs. Live away from traffic consumes the queued id on return. Send on traffic selects new events and applies writes. Recovery tests stall actual server-function network reads after successful and timed-out advances; each rejects overlapping sends and accepts another persisted event after the 30-second refresh window without reload.

Fresh side-by-side images were visually inspected at 1440 and 390. The traffic content matches the approved macOS baselines. The design includes the admin-only All companies sidebar link; the isolated owner account correctly omits it. Dynamic trace values differ as intended. Empty-bus and missing-agent screenshots show approved boundary states. The saved harness reproduces this phase. The disposable server, config, specs, and in-memory database were removed at completion; no source or test changes remain in the worktree.
