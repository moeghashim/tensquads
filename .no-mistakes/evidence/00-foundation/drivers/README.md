These disposable drivers ran in `.test-phase/` in the supplied worktree. To reproduce, copy the files into `.test-phase/` in a disposable checkout with `npm ci` completed. Start the app with `npm run dev -w @tensquads/web` for browser.mjs. All evidence paths in these drivers name the evidence directory for this run.

seed-live.mjs uses extra local tooling installed with:

```
npm install --prefix .test-phase/tooling --ignore-scripts --no-audit --no-fund pglite-server@0.1.5 ws
```

It starts an in-memory PGlite database exposed through a real PostgreSQL wire-protocol server and local WebSocket bridge. The unmodified product seed CLI runs twice with the real Neon Pool, using a preload module to configure only that disposable endpoint. Both exits are zero and both transcripts contain all nine expected totals. No service credentials are needed. The fixture closes its servers and database.

worker-response.json was obtained from workerd via Miniflare, with the complete adapter dependencies bundled. It opens and closes the Neon adapter without making a network connection and produces an event with its default trace. The returned migration text equals migration.sql. The compiled full-worker-bundle.js includes readFileSync calls inside Neon's bundled connection-string parser; this is diagnostic evidence, not evidence of a successful filesystem read.

guard-mutations.json runs an unchanged copy of scripts/test/worker-bundle.test.mjs against small disposable entry points. The direct filesystem import fails as expected. A package dependency that exports a filesystem loader and a package dependency that exports PGlite as Database both incorrectly pass because bare imports are marked external. These are adversarial test checks, not live product runs.

configuration.json is a normalized YAML/lockfile check. It does not prove a hosted GitHub cache save or no-mistakes execution. This phase did not launch either pipeline.

The temporary workspace, local servers, database, and generated Wrangler state were removed after testing. Dependencies materialized by npm ci remain for subsequent phases.
