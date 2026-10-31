# tensquads

A small business runs its operations through a squad of AI agents. One master agent coordinates them.

Phase 0 provides a blank TanStack Start app on Cloudflare, six empty kernel plug-ins, domain types, test adapters, a Drizzle schema, the design seed, light tokens, icons, and the Approval model. Screens and sign-in come in later phases. Start with `AGENTS.md`.

Use Node 24 (`.nvmrc`) and npm 11.19.1. From the repository root:

```sh
npm ci
npm run dev -w @tensquads/web
```

Open `http://localhost:3000`. The document title is tensquads. The body has no visible text. Local development and unit tests need no service credentials.

| Command | What it does |
| --- | --- |
| `npm run check` | Check native tools, Biome, file length, and root and workspace types |
| `npm test` | Run script, kernel, domain, adapter, and seed tests; database tests use in-memory PGlite |
| `npm run e2e` | Check the blank page with Chromium, screenshots, and axe |
| `npm run design:check` | Check the design hashes without writing files |
| `npm run statechart:check` | Check models when `packages/statecharts` differs from `origin/main`; run if that diff cannot be read |
| `make verify` | Run all five checks above in order |
| `npm run build:cloudflare` | Build the Worker |
| `npm run preview:cloudflare` | Build and run the Worker locally with Wrangler |
| `npm run deploy:cloudflare` | Build and deploy through an authenticated local Wrangler session |
| `npm run typegen:cloudflare` | Regenerate Worker types after binding changes |
| `npm run seed` | Migrate and replace the database contents with the design seed; see the [seed workflow](docs/foundation.md#seed-workflow) |

Install Playwright Chromium with `npx playwright install chromium` before the first e2e run. Model checks need mise and network access on the first run, or existing Java and TLC paths. See [foundation setup and APIs](docs/foundation.md) for the toolchain, service configuration, seed, and verification limits. CI runs verification and builds; deployment is local.

| Path | What it is |
| --- | --- |
| `AGENTS.md` | The rules for every agent. Read it first, every session |
| `docs/PLAN.md` | The build plan with the 28 decisions |
| `docs/BRIEF.md` | The original build brief |
| `docs/foundation.md` | The implemented phase 0 APIs, data, setup, and checks |
| `docs/adrs/0001-cordis-pin.md` | The exact cordis pin and update rule |
| `docs/skills-sources.md` | Skill sources and the local Approval verification skill |
| `apps/web/` | The blank app and its generated design assets |
| `packages/` | Kernel, domain, adapters, seed, and statecharts |
| `design/` | The design files, copied from the canvas. `MANIFEST.json` holds the canvas version and each file's hash |
| `design/inventory/` | What each design file contains, listed by a script: texts, styles, colours, handlers, strings |
| `scripts/design-check.mjs` | Proves `design/` matches the canvas |
| `scripts/design-inventory.mjs` | Makes `design/inventory/`; it writes under `design/`, so do not run it during normal verification |
| `tasks/` | One task file per unit of work. `00-foundation.md` is first; `05-proof-of-concept.md` is the three-squad proof of concept |

The design canvas: https://claude.ai/artifact/B7seDz5psECQTerDG6rfy4
The plan: https://claude.ai/artifact/21JpQUuhEFqLZL8dPrj8NN
