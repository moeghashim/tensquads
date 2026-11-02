# Overview local product validation

The real TanStack routes, React screen, workspace provider, server functions, readOverview loader, Drizzle repositories and Kernel Policy commands ran on localhost:3107. The only substituted boundary was workspace-session.ts: it supplies a disposable test account and the repository-supported PGlite database in place of Clerk authentication and the remote database connection. All fixtures use the real migration and design seed. No source file was changed.

This validates overview behavior inside the test account. It does not validate Clerk sign-in, a real authenticated session, the Neon WebSocket transport, or Cloudflare workerd. The sandbox has no Clerk keys or TEST_DATABASE_URL. A Clerk development instance with publishable/secret keys and an isolated test database is required for the existing authenticated e2e/overview.spec.ts suite. No shared services or operator data were used.

## Reproduce

Copy harness/ to .test-overview-local/ in the worktree. Run:

- node --experimental-strip-types node_modules/vite/bin/vite.js --config .test-overview-local/vite.config.ts
- node --experimental-strip-types .test-overview-local/drive.ts
- node --experimental-strip-types .test-overview-local/visual.ts

The driver writes screenshots and state evidence to this run's evidence directory. Run the drivers sequentially because they share one disposable database. Stop Vite and remove .test-overview-local/ when finished.

## Results

All eight browser scenarios passed. Accessibility passed at 1440 and 390 using the project's existing overview-online-pill exception. Tab reached all 25 buttons, each with the required 2px blue focus outline and 2px offset. Tile/card geometry matched the rendered design within 0.5px at both widths. The mobile page had no horizontal scroll. Browser page errors were empty.

Initial driver-only failures were corrected: wait for hydration before keyboard input; include the chart's 1px border in its measured height; update the stored tiles JSON array using the real schema; identify repeated buttons by element index when counting keyboard reachability. The final browser and accessibility drivers exited 0. No production code or baseline changed.

The supplied npm ci && npm test baseline had already passed. Additional focused domain, overview action, overview read and adapter Approval checks passed. The complete suite, lint, static analysis, CI, push, deploy and statechart phases were not run in this assigned test phase.
