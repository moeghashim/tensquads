# Traffic local test phase

Target: 54957b1359c237b10b914611b142b55603f1a13e, base: 62ef6c578b8c5f895f8d756094e8268991e230d7.

The supplied baseline `npm ci && npm test` passed before this phase. It was not repeated. No full suite, lint, formatter, static analysis, deploy, push, PR, or CI command was run here.

## Isolation and scope

No Clerk or database credentials were configured. The real TanStack app ran on localhost:3000 with a disposable Vite test configuration. That configuration replaced only the external authentication identity (`validation-user`) and the database connection factory. The database was a fresh in-memory PGlite PostgreSQL instance with the real migrations, design seed, Drizzle repositories, transactions, Bus plug-in, Kernel, server functions, routes, workspace provider, live module, and UI. This validates traffic behavior with external service boundaries isolated. It does not validate Clerk sign-in, the Neon network transport, or the Cloudflare runtime.

`run-harness/` preserves the disposable setup at its original worktree-relative paths. The copied traffic spec keeps the existing behavior assertions; its login fixture opens the disposable identity's workspace, its SQL fixture helpers use local setup endpoints, and its evidence output goes to the assigned evidence directory. The baseline PNGs and screenshot thresholds were not modified. Two added disposable specs exercise refresh stalls, duplicate ids, missing agents, and empty data. All temporary worktree files and the server were removed after testing.

## Commands

- `node scripts/design-check.mjs`: design matches the canvas.
- `node --experimental-strip-types --test scripts/test/traffic-live.test.mjs packages/adapters/test/traffic.test.ts`: all focused behavior checks passed.
- From apps/web: `TEST_DATABASE_URL=pglite-local ../../node_modules/.bin/vite --config vite.validation.config.ts --port 3000`.
- `TRAFFIC_EVIDENCE=1 npx playwright test --config .traffic-validation/playwright.config.ts`: all 20 traffic browser checks passed, including unchanged macOS baselines and side-by-side captures at 1440 and 390.
- `npx playwright test --config .traffic-validation/refresh.config.ts`: all four real-app refresh-stall cases passed, for Send and Live after successful and timed-out advances. Server-function reads were held pending. The guard rejected overlapping sends, then accepted another POST and persisted another event after the 30-second refresh window, without reload.
- `npx playwright test --config .traffic-validation/boundary.config.ts`: missing agent uses its id and has no hub node; duplicate e100 leaves history, store, and cursor unchanged; empty bus keeps blank inspector cards and shared state. All passed.
- Inspected both new side-by-side images visually. The existing workspace sidebar omits the admin-only All companies control for this account; the traffic content matches its approved baselines.

## Setup corrections

The first app attempt had no database URL marker, so the real session guard refused to open a database. Setting the process-local `TEST_DATABASE_URL=pglite-local` resolved it. The first additional boundary test could not delete Orders until its child machine and skill rows were deleted, and the empty-state selector needed to expect both designed None values. These were disposable setup/test issues; all affected scenarios were re-driven and passed. No product code changed.

## Evidence

- `traffic-results.json`, `refresh-results.json`, and `boundary-results.json`: browser scenario records from this run.
- `run-behavior-log.txt`: observed recovery request/event counts and duplicate-id state comparison.
- `side-by-side-1440.png` and `side-by-side-390.png`: design at left, running build at right.
- `run-missing-agent.png` and `run-empty-bus.png`: running boundary states.
- `run-receipt.txt`: source-of-truth file hashes and design check receipt.

Broad make verify and remote CI belong to the outer pipeline and remain outside this assigned test phase.

## Product failure found in a final console check

The server's browser-console forwarding exposed a React error on traffic event insertion. A fresh isolated browser run reproduced it with `npx playwright test --config .traffic-validation/console.config.ts`. The send persisted and selected Daily stock check, but React logged: Cannot update a component (WorkspaceProvider) while rendering a different component (TrafficPage). The focused no-console-errors assertion failed. `useTrafficSelection` calls the provider setter during TrafficPage rendering (page.tsx:378; the queued-event path at :368 does the same). Move that provider update into a commit-phase effect while retaining the specified selection behavior. No product repair was made in this test phase.

`console-results.json`, `run-console-errors.txt`, `run-send-console.png`, and `console-playwright/` retain the reproduction. The overall verdict is no-go because this browser check failed, despite the functional, visual, boundary, and timeout scenarios passing.
