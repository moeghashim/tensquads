# Task 00 — Foundation (phase 0)

Branch: `00-foundation`. One pull request. One builder agent. Read `AGENTS.md` first and send the receipt.

## Goal

An empty tensquads app that deploys to Cloudflare, with the core, the database schema, the seed, the tokens, the icons, the checks and the first state model in place. No screen yet. `make verify` returns 0. See [the foundation guide](../docs/foundation.md) for the implemented APIs, seed workflow, and verification limits.

## Read

- `docs/PLAN.md`: Decisions (all), Architecture, Repository and tools, Service setup, State models, How the AI agents work, Phases (phase 0)
- `docs/BRIEF.md`: Data model, Design tokens, Definition of done
- `design/Main.dc.html`: the script at the bottom, in full. It holds every mock data object the seed must reproduce
- `design/ds/agent-ui/tokens.json`
- `design/inventory/Main.json`, `design/inventory/Home.json`, `design/inventory/Onboarding.json`, `design/inventory/SignIn.json`

## Steps, in order

1. Copy PI-Starter (`github.com/moeghashim/PI-Starter`) into this repository. Keep: strict TypeScript, Biome, husky hooks, `progress.md` and its append-only check, `no-mistakes`, Fallow, the GitHub Actions jobs, DCO, Dependabot, `.agents/skills/`. Remove: the Next.js app under `apps/web`.
2. Make a TanStack Start app at `apps/web` with `npm create cloudflare@latest -- apps/web --framework=tanstack-start`. Pin `@tanstack/react-start` to exactly `1.169.4`. Add `nodejs_compat` to `wrangler.jsonc`. One Worker. Leave room for a Durable Object class and a Queue consumer in the same Worker (decision 16); do not build them.
3. Service setup with Stripe Projects, from the repository root, as `docs/PLAN.md` "Service setup" lists: `stripe projects init tensquads`, then `cloudflare/workers`, `neon/postgres`, `clerk/auth`, then `stripe projects env --pull`. Commit `.projects/state.json`. Git-ignore `.projects/vault` and `.env`. If a command needs Moe's account or card, stop and ask.
4. `packages/kernel`: pin cordis to `4.0.0-rc.12` (published commit `01b396240ce47cf2779c40af9bc445bb748fe112`). Build the `Kernel` module. It is the only file that imports cordis. It loads six empty plug-ins: platform, squads, bus, policy, catalog, conversation. It exposes five interfaces with no adapter except where step 6 says: `MachineProvider`, `EventBus`, `IntegrationGateway`, `Repositories`, `Decider`. Record the pin and the rule for updates in `docs/adrs/0001-cordis-pin.md`.
5. `packages/domain`: one folder per domain area. Each holds its data objects (the entities in `docs/BRIEF.md` "Data model", with the field names the design uses), its events, and its repository interface. No database type crosses into this package.
6. `packages/adapters`: `test-machine` (answers the design's host, region, size, cpu, uptime, egress and secrets; off means CPU 0% and uptime "Paused"), `memory-bus` (holds the design's bus events; `nextEvent()` appends the next one and applies its `set` values; `writes` lists keys for display), `placeholder-services` (every method does nothing and returns the design's value), `neon/` (the Drizzle schema and the repositories). Every tenant table has `account_id`. Plans, agent images, bugs, and feature requests are platform tables and have no `account_id`. Every repository takes an `AccountScope` and rejects a call without one.
7. `packages/seed`: read the mock data in `design/Main.dc.html` (and the agents in `design/Home.dc.html` and `design/Onboarding.dc.html`) and write it into Neon, word for word. Add the two proof-of-concept agents (decision 24) only to the homepage and sign-up data, as the design shows. Tests assert: Accounts 9, Agents 66, Squads 17, Monthly recurring $1,294, All-time value $14,568, Tasks done 331, Agent images 7, Open bugs 8, Features requested 15. The repositories compute platform totals. `Account.agents`, `online`, and `tasks` stay per-account design fields. Agents 66 sums account counts; only demo has five agent rows, four online, with 331 tasks. Squads 17 counts squad rows. Seed the 14 daily revenue rows and one overview-tile row for demo. Event traces use `tr_` plus six SHA-256 hex characters of the event id. Tests use PGlite; `npm run seed` runs the migration, then replaces all workspace and catalog data in one transaction.
8. `apps/web/src/design/tokens.css`: generate from `design/ds/agent-ui/tokens.json`. Then compare with `docs/BRIEF.md` "Design tokens" and with the colours in `design/inventory/*.json`. Where the inline styles in the design differ from `tokens.json`, the inline styles win (the brief says so). Write every such difference to `apps/web/src/design/OVERRIDES.md`. A colour in the inventory that is in neither list is a question for Moe; add the two agent tints from decision 27.
9. `apps/web/src/design/icons/`: copy every inline SVG from the design files, one file per icon, as 16 px stroke SVGs at 1.5 px. Name each by what it shows.
10. Checks: Playwright with a blank-page screenshot comparison at 1440 px and a 390 px viewport; axe-core for the keyboard and label checks; Java `temurin-25` in `mise.toml`, with TLC pinned by the statechart skill. `scripts/design-check.mjs` and `scripts/design-inventory.mjs` are already here; wire them into `npm run design:check` and `npm run design:inventory`. The inventory command writes under `design/`; it is not a normal verification step.
11. `packages/statecharts/approval`: write the Approval state model in TLA+ with the pstack `statechart` skill. States and rules are in `docs/PLAN.md` "State models". Commit the spec, the config, the view module and the chart. Then run `/create-formal-verification-skill` and commit the `tensquads-verify` skill it makes.
12. `Makefile` with `verify`: `npm run check` (Biome, tsc), `npm test` (unit, seed assertions), `npm run e2e` (Playwright, empty app for now), `npm run design:check`, `npm run statechart:check` (when `packages/statecharts` differs from `origin/main`, or the diff cannot be read; models in parallel; local tool reuse, no CI tool cache). Exit 0 is the only accepted evidence.
13. CI: PI-Starter's "Required checks" aggregate plus the Cloudflare build job, with `make verify` as the gate. CI builds but does not deploy. Deploy the empty app locally to a Cloudflare preview with `npm run deploy:cloudflare`.
14. Append one line to `progress.md` when the pull request merges.

## Done when

- [ ] `make verify` returns 0 on the branch and in CI
- [ ] The empty app deploys to a Cloudflare preview URL and returns 200
- [ ] The seed tests pass with the nine numbers above
- [ ] `node scripts/design-check.mjs` returns 0
- [ ] `docs/adrs/0001-cordis-pin.md` exists
- [ ] `packages/statecharts/approval/chart.mmd` exists and TLC reports no broken rule
- [ ] The pull request lists every token difference from `OVERRIDES.md` and every question raised

## Do not

- Do not build any screen. That is phase 1.
- Do not build the Durable Object, the Queue consumer, the boat.dev adapter or any model call. That is phase 4 and phase 5.
- Do not change anything under `design/`.
