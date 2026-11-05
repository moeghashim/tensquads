Live database validation

The real adapter and Kernel ran against disposable PostgreSQL 18.6 on 127.0.0.1:55439. A local WebSocket-to-TCP proxy on 55440 carried the Neon driver's real PostgreSQL protocol. It did not replace SQL execution or lock behavior. No shared database or Clerk account was used.

The live-database-transcript.jsonl records observed results and persisted data. live.mjs contains the assertions and commands. To reproduce, copy the three .mjs files into .local-validation in the repository, install embedded-postgres there with npm install --prefix .local-validation --no-package-lock embedded-postgres, and run node .local-validation/server.mjs. In another terminal run:

TEST_DATABASE_URL=postgres://validation:validation@127.0.0.1:55439/validation node --import ./.local-validation/preload.mjs --experimental-strip-types .local-validation/live.mjs

Targeted integration command:
TEST_DATABASE_URL=postgres://validation:validation@127.0.0.1:55439/validation node --import ./.local-validation/preload.mjs --experimental-strip-types --test --test-concurrency=1 packages/adapters/test/writer-lock.test.ts packages/adapters/test/create-lock.test.ts packages/adapters/test/reset-lock.test.ts

Seed command, run twice:
NEON_POSTGRES_CONNECTION_STRING=postgres://validation:validation@127.0.0.1:55439/validation node --import ./.local-validation/preload.mjs --experimental-strip-types packages/seed/src/cli.ts

The seed logs were identical. seed-persisted-state.log records the revision and account count after the second seed.

This change alters database locking and migration behavior. It has no visible UI change, so database transcripts and persisted state provide evidence instead of screenshots. The server, proxy, downloaded package, and data directory were removed after validation.
