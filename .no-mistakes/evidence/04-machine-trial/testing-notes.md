# Targeted runtime validation

The configured `npm ci && npm test` failure was reported by the outer executor. It was not rerun. No full suite, lint, static analysis, deploy, workflow dispatch, or pipeline command was run.

## Local runtime

Installed `@embedded-postgres/darwin-arm64@18.6.0-beta.19` under `.test-phase/tools` after the Docker daemon was unavailable and PATH initdb lacked postgres. Started PostgreSQL on 127.0.0.1:55439 with all data in `.test-phase/pgdata`, Unix sockets disabled. A WebSocket-to-TCP transport bridge on 127.0.0.1:55440 connected the unmodified Neon driver to this real database. Refused-port requests went to port 9. No database query or product response was mocked.

Copied `packages/adapters/test/cloudflare-bus.test.ts` to a disposable sibling `.phase-cloudflare.test.ts`, pointed its esbuild entry at `.test-phase/worker.ts`, and added live seeded-state and alarm-recovery checks. The wrapper exports the production AccountBus and existing bus-worker queue handler; it sets Neon transport options and adds one route to call the production scoped store interface. Existing test endpoints expose the real product interfaces. Final runtime checks all passed. The 30-second alarm flushed the retained event to PostgreSQL after an outage.

Commands:

- `node --experimental-strip-types --test packages/adapters/test/adapters-flag.test.ts packages/adapters/test/boat-machine.test.ts packages/adapters/test/bus-state.test.ts packages/adapters/test/bus-recovery.test.ts scripts/test/bus-trial.test.mjs scripts/test/bus-trial-cleanup.test.mjs`
- `TEST_DATABASE_URL=postgres://trial:trial@127.0.0.1:55439/trial node --import ./.test-phase/neon-config.mjs --experimental-strip-types --test packages/adapters/test/.phase-cloudflare.test.ts`
- `node .test-phase/trial-account.mjs` exercised createTrialAccount/deleteRows via the actual Neon tagged-template client, an HTTP transport bridge, and PostgreSQL. Creating twice was idempotent; FK child insertion succeeded; child and parent cleanup preserved a neighboring account.
- `npm run dev -w @tensquads/web` ran the real web Worker on port 3001 because port 3000 was occupied. No requests went to the other server.
- `node .test-phase/ui.mjs` used Playwright Chromium to capture the homepage at 1440 and 390 px. Document width equaled viewport width at 390 px. This is a homepage smoke check, not proof of pixel parity for all ten screens.
- `curl -s -i -X POST -H 'Content-Type: application/json' --data '{"accountId":"isolated","agentId":"orders"}' http://localhost:3001/machine/take` returned 503 without a configured machine token key.
- `curl -s -i http://localhost:3001/agents/support` redirected to /signin.
- `MACHINE_TRIAL=1 GITHUB_RUN_ID=9999951105 node --experimental-strip-types --test packages/adapters/test/live/machine-trial.test.ts` stopped before external access: BOAT_API_KEY absent.
- `BUS_TRIAL=1 GITHUB_RUN_ID=9999951105 TEST_DATABASE_URL=postgres://trial:trial@127.0.0.1:55439/trial node scripts/bus-trial.mjs` refused to run: CLOUDFLARE_API_TOKEN absent.

## Limits

No .env was present and no Boat, Cloudflare, Neon, or Clerk credentials were exported. Fake-Boat unit checks passed but are not live machine proof. The deployed Cloudflare trial was not run; no workflow was dispatched. Authenticated screens require a disposable Clerk development instance and user session; a local PostgreSQL database cannot issue Clerk credentials. Real Boat trial requires BOAT_API_KEY, BOAT_ADMIN_API_KEY, a paid account and an isolated empty tensquads-agents profile. A deployed trial needs an authorized isolated Cloudflare account/token and isolated Neon TEST_DATABASE_URL; the outer executor owns dispatch/deploy phases.

## Cleanup

Stopped our web server, WebSocket bridge and PostgreSQL. Removed the disposable package, database, harness, generated .dev.vars and newly created Wrangler state. Retained pre-existing dist, Wrangler deploy output and root node_modules. No source changes remain. Reproduction harness copies are in harness/; restore each to its original path stated above before rerunning.
