# Phase 0 foundation

This guide describes the code in `00-foundation`. [PLAN.md](PLAN.md) holds the build decisions and later phases. [BRIEF.md](BRIEF.md) remains the original brief. Design copy and inline styles stay authoritative.

## Setup and commands

Use Node 24 from `.nvmrc` and npm 11.19.1 from `package.json`. Run `npm ci` from the repository root. The native preflight checks the Node major and the installed Biome, esbuild, and TypeScript binaries for the current OS and CPU. Reinstall dependencies on the current platform if they do not match. Root and package checks use TypeScript 7; the web workspace has its own TypeScript 6 dependency and check.

`npm run dev -w @tensquads/web` serves `http://localhost:3000`. The only route is `/`, with an empty `main` element and the document title `tensquads`. It does not import tokens or icons, call the kernel, or use service credentials. Clerk is provisioned in `.projects/state.json`; its SDK and sign-in flow are not implemented.

Use `npm run build:cloudflare` to build, `npm run preview:cloudflare` to build and run Wrangler locally, and `npm run deploy:cloudflare` to build and deploy from an authenticated local session. `apps/web/wrangler.jsonc` defines one Worker with `nodejs_compat` and observability enabled. It has no Durable Object or Queue binding. Use `npm run typegen:cloudflare` after binding changes. CI builds but does not deploy.

For existing service access, run `stripe projects env --pull` from the repository root with the Stripe Projects CLI. The service slugs are `cloudflare/workers`, `neon/postgres`, and `clerk/auth`. `.projects/state.json` is committed. `.env`, `.env.*` (except `.env.example`), `.projects/vault`, and local Projects state are ignored. There is no committed `.env.example`. Local tests do not need these services.

## Packages and ports

The four package workspaces export TypeScript source through their package names:

| Package | Interface |
| --- | --- |
| `@tensquads/kernel` | `Kernel` registers six empty cordis plug-ins. `machine`, `bus`, `gateway`, and `repositories` start as `null` and can be assigned adapters. `decider.decide(question, answers)` takes a question and a list of possible answers and returns one answer with a confidence. Version 1 has no adapter, so the call throws `Decider has no adapter in version 1.` |
| `@tensquads/domain` | Six domain areas with types, events, repository interfaces, scope validation, and pure inbox decision functions |
| `@tensquads/adapters` | Machine and service test adapters, the memory bus, Drizzle schema, database openers, snapshot replacement, and read repositories |
| `@tensquads/seed` | Committed design extract, `workspaceFromDesign()`, `homepageAgents`, `signupAgents`, and `defaultAgents` |

`packages/statecharts` is a model directory, not an npm workspace. The exact cordis version and update rule are in [ADR 0001](adrs/0001-cordis-pin.md). The kernel exposes minimal repository ports; `RepositoryBag` in the domain package describes the full read interface.

`createTestMachine(rows)` implements `MachineProvider`. Off rows return CPU `0%` and uptime `Paused`. An on row whose stored uptime is `Paused` returns `Just started` (Main.dc.html:1267). Any other on row returns its stored uptime and CPU. `makeTemplate(imageId)` returns `{ id: "template-" + imageId }`. `startFromTemplate(templateId, agentId)` returns those two ids. Version 1 does not roll an image out. An unknown agent id throws.

`createPlaceholderServices(store)` implements `IntegrationGateway`. Both `read(key)` and `write(key, value)` return the existing store value. `write` does not change it.

`createMemoryBus({ events, script, store, trace? })` implements `EventBus` and adds `store()`. It copies the initial event list and store. It does not replay the seeded writes. `nextEvent()` cycles through the script, appends an event, and applies its optional `set` values to the local store. `writes` lists keys; it does not supply values. An empty script returns `undefined`. The first generated event is `e100` at `11:03`; each step increments the id and clock. The design's first scripted event has no `set`; the second changes the store. This adapter does not persist changes to Neon or deduplicate events.

`traceFor(id)` returns `tr_` plus the first six lowercase hex characters of SHA-256 of the event id. Seeded events and the memory bus use this form. A supplied `trace(id)` function overrides the memory bus default.

## Database and repository scope

`openPostgres(connectionString)` uses Drizzle with the Neon serverless driver (`@neondatabase/serverless` 1.2.0) and a pool of one connection. It returns `{ db, migrate, close }`. `migrate()` runs every statement in `migration.sql`. Call it before the seed and close the connection when finished. `openPglite()` creates an in-memory database, applies the same SQL, and returns `{ db, close }` for tests. PGlite is not the Neon seed driver. The schema is `packages/adapters/src/neon/schema.ts`. The migration creates a missing table and adds `sort_order`, or `seq` on `bus_events`, when the table already exists. `state_entries.value` is text. Each stored value is `JSON.stringify` of the design value, and `readStore` uses `JSON.parse`, so a string, a number, a boolean, an array, and an object come back as that same type. The design value `'["Black hoodie M","A3 frame"]'` stays a string.

`createRepositories(db)` returns six read repositories. Every call requires an `AccountScope`:

```ts
import { createRepositories } from '@tensquads/adapters';

const repos = createRepositories(db);
const demo = { accountId: 'demo', mode: 'account' } as const;
const platform = { accountId: 'platform', mode: 'platform' } as const;
const agents = await repos.squads.listAgents(demo);
const totals = await repos.platform.totals(platform);
```

`db` above is an open database from either opener. Both modes require a non-empty `accountId`. A missing scope, empty id, or invalid mode throws `MissingAccountScopeError`. Account mode filters tenant reads by that id. Platform mode reads across accounts. Scope is a data boundary, not authentication; a caller must authorize platform access before constructing that scope. Auth and the super-admin session come later.

Plans, agent images, bugs, and feature requests are shared platform data. They have no `account_id` and are returned for either valid scope. Other tables have `account_id`. SQL names such as `is_on`, `last_text`, `description`, `from_agent`, and `rule_when` map back to the design names `on`, `last`, `desc`, `from`, and `when` in the domain objects.

| Repository | Reads |
| --- | --- |
| `platform` | `listAccounts`, `totals`, `listPlans`, `overviewTiles`, `dailyRevenue` |
| `squads` | `listSquads`, `listAgents`, `master`, `tasksDone` |
| `bus` | `listEvents`, `readStore` |
| `policy` | `listRules`, `listApprovals`, `listMissionProposals`, `inbox` |
| `catalog` | `listImages`, `counts` |
| `conversation` | `thread` |

`overviewTiles` returns `null` for platform scope or an account without tiles. `master` and `thread` return `null` for platform scope or a missing row. Every list read sorts by `sort_order` ascending. `listEvents` sorts by `seq`, the sequence number, not by time. `saveWorkspace` assigns those numbers from the design array index, so the read order is the design order. `overviewTiles` is one jsonb array, so its order is the array order. `listApprovals` and `listMissionProposals` include decided rows; `inbox` filters them for display. These repositories do not persist domain decisions.

Account `agents`, `online`, and `tasks` are per-account design fields. Platform Agents 66 is the sum of `Account.agents`, not the number of agent rows. Squads 17 is the number of squad rows. Account objects join `plan`, `status`, `mrr`, `ltv`, and `started` from subscriptions, where those values are stored once. Platform MRR and all-time value sum the subscription values. Tasks done sums agent rows. Catalog counts include all shared images, bugs, and feature requests even with account scope.

The implemented domain also includes `Account.mission`, `Agent.mission`, `targets`, and `contribution`, and `MissionProposal`. Agent targets are `[label, current, goal]` triples; proposal targets are `[label, goal]` pairs. `Rule` uses `when`, `action`, `agent`, `approval`, and `on`. Agent `success` is the stored formatted design string in phase 0. Runtime check ratios are future work.

## Seed workflow

`npm run seed` reads `.env` from the current directory without overriding existing environment variables. It requires `NEON_POSTGRES_CONNECTION_STRING`. Run it from the repository root against a database intended for the design data.

The command always runs the migration, then calls `saveWorkspace(db, snapshot)`. This replaces every row in all tables in the adapter schema, including all accounts and the shared catalog. It does not merge with existing records. The replacement runs in one database transaction: if any insert fails, the previous table contents remain. Repeating a successful seed produces the same data. The migration runs before that transaction. The command prints the nine computed totals and closes the connection.

`workspaceFromDesign()` reads `packages/seed/src/design.json`, not the HTML at runtime. It creates nine accounts with their squads, subscriptions, and a master named `Master`. Only `demo` has workspace agent rows: five agents, four online, and 331 tasks. Demo also gets the bus, store, rules, approvals, mission proposals, chat, 14 daily revenue rows for 14–27 October 2026, and one row containing the overview tiles. Other accounts have no workspace agents or revenue; their tiles are `null`. Missing company missions use `[MISSION NOT SET]`.

Market researcher and Website builder are in the homepage and sign-up exports. They are not workspace agent rows in this seed. A proof-of-concept workspace comes in phase 5. The seed tests compare the extract with the HTML and use in-memory PGlite to assert Accounts 9, Agents 66, Squads 17, MRR $1,294, all-time value $14,568, tasks done 331, images 7, bugs 8, and feature requests 15. They do not connect to Neon.

When an approved canvas update changes the source data, regenerate the committed extract from the repository root:

```sh
node scripts/extract-design.mjs > packages/seed/src/design.json
```

Do not edit `design/` to make a test pass. `npm run design:check` checks the manifest hashes. `npm run design:inventory -- Main` regenerates `design/inventory/Main.json`; the optional argument is a design filename prefix, not a built HTML path. This command writes under `design/` and is not part of `make verify`.

## Inbox decisions

The Policy functions are pure: they return new agent and decision objects. They do not save rows or emit bus events. `decideApproval` acts only on Pending spends; `decideMission` acts only on Proposed missions. Repeating a decision on any other status returns the input objects without another change. `askRevise(agent, proposals, id)` adds one Revising proposal for that agent when the list has no Proposed or Revising proposal for the same agent (Main.dc.html:1186). An Approved proposal does not block a new one, because the design removes it. The caller supplies the id. The function does not change the agent.

| Decision | Agent change | Item status |
| --- | --- | --- |
| Approve spend | Add one task; set `last` to the approval title plus ` (approved)` | Approved |
| Decline spend | None | Declined |
| Approve mission | Set mission; map target pairs to triples with current `—`; reset contribution to 0; keep tasks | Approved |
| Decline mission | None | Revising |
| Ask to revise | None. Add one Revising proposal when that agent has no proposal left | Revising |

`inboxCount` counts Pending spends plus Proposed missions. `inboxIsEmpty` is true only when no spend is Pending and all proposals are Approved. A Revising proposal remains visible but adds no badge count. Therefore a zero badge can coexist with a non-empty inbox. `inbox()` returns the exact empty sentence only when empty: `Nothing waiting. Your squads are working inside their limits.`

## Design assets

Generate the light tokens and their override record together with `node scripts/generate-tokens.mjs`. This writes `apps/web/src/design/tokens.css` and `OVERRIDES.md`. A token alias is written as `var(--name)`, so `--canvas` is `var(--gray-75)`. Inline and script-built values take precedence over the base token file. Each category is compared with its own tokens: a spacing token does not hide a radius, a font size, or a line height. A script that joins two strings contributes the joined value. Dark values are not copied. The required colours and decision-27 tints are recorded in [OVERRIDES.md](../apps/web/src/design/OVERRIDES.md). `rgba(0,0,0,.2)` already occurs inside `--shadow-switch-thumb`; the inline shadow remains a separate override. `transparent` and `none` are CSS keywords, not tokens. The blank page does not import `tokens.css`. A browser test resolves `--canvas`, `--text`, and `--ring` from a page that inlines the file.

`node scripts/generate-icons.mjs` writes one SVG file for each distinct inline SVG body in `design/*.dc.html`. The current design has 21 files, including `check-wide.svg` (`M3 8.5 6.5 12 13 4.5`) and `chevron-left-sm.svg` (`M10 3.5 5.5 8l4.5 4.5`). The generator does not drop a path because another icon looks similar. A name map only supplies the file name. An unknown body throws. Icons use a 16 px view box, 1.5 px stroke, and `currentColor`. They are hidden from assistive technology; the containing icon-only control needs its own label. The blank page does not link them. `scripts/test/icons.test.mjs` reads every `d` attribute from the design files and requires that path in the generated files.

## Verification limits

`make verify` runs `check`, unit tests, e2e tests, design hashes, and the conditional statechart check in that order. Run `npx playwright install chromium` once before e2e. Playwright uses `http://localhost:3000`, starts its own server, and does not reuse an existing server. Screenshots are `e2e/blank.spec.ts-snapshots/empty-1440.png` and `empty-390.png`, with no platform segment. Axe disables `page-has-heading-one` only for this blank page, where a heading would introduce visible text. Later screens still need their own behaviour, keyboard, overflow, and design comparisons.

`npm run statechart:check` runs when `packages/statecharts` differs from `origin/main`, or when a code file named in a model's `# model:` comment differs. `Approval.tla` names `packages/domain/src/policy/decide.ts`. Untracked files count. A diff that cannot be read also runs the check. It runs the discovered models in parallel. After TLC exits 0, the generated `chart.mmd` must equal the committed chart. A chart that is not a `stateDiagram-v2`, a missing generated chart, or any difference exits non-zero. TLC's own non-zero exit is returned as-is. The temporary directory is removed after the comparison.

The statechart runner uses mise for Java `temurin-25` and its own checksum-pinned TLC 1.7.4. The first run may install tools and needs network access. To use existing tools, set `TLA2TOOLS` to a `tla2tools.jar` path and optionally `JAVA` to the Java binary (Java 11 or later). CI caches the mise toolchain with `cache_key: mise-${{ hashFiles('mise.lock') }}`. `mise.lock` pins `java` `temurin-25`. The TLC jar stays in the statechart skill.

Run the local [tensquads-verify skill](../.agents/skills/tensquads-verify/SKILL.md) for inbox code or model changes, even if the automatic model gate skips. It requires both the domain tests and `/statechart`. The Approval model covers one spend and one mission proposal. It does not prove the TypeScript, multiple concurrent inbox items, target rows, the database, or the other seven planned state machines. The code tests cover target mapping and repeated decisions.

GitHub Actions runs `make verify` on Linux and macOS and a separate Cloudflare build. The stable Required checks aggregate fails when a required job fails, is cancelled, or is skipped. Only a Fallow skip outside a pull request is accepted. Fallow runs for pull requests. The local no-mistakes push gate runs its test and lint commands from `.no-mistakes.yaml`; it does not replace the full `make verify` run. Keep the Node version from `.nvmrc` on its PATH and push with `git push no-mistakes`.

`.no-mistakes.yaml` lists `docs/PLAN.md`, `docs/BRIEF.md`, `tasks/00-foundation.md`, `README.md`, `AGENTS.md`, `CLAUDE.md`, and `design/**` as protected paths, and it asks every pipeline commit for `Signed-off-by: Moe Ghashim <mohanadgh@gmail.com>`. `protected_paths` is read only from the default branch, so this copy does nothing until it is on `origin/main`. Until then, run the pipeline with `--skip document` and do not authorize `--action fix`. `auto_fix` is 0 for every step. `auto_fix.document: 0` does not stop the first document pass; `--skip document` does. Every commit on this branch uses `git commit -s`.

| Command | What it does |
| --- | --- |
| `npm run check` | Check native tools, Biome, file length, and root and workspace types |
| `npm test` | Run script, kernel, domain, adapter, and seed tests. Database tests use in-memory PGlite |
| `npm run e2e` | Check the blank page with Chromium, screenshots, and axe, and resolve three token colours |
| `npm run design:check` | Check the design hashes without writing files |
| `npm run statechart:check` | Check models when `packages/statecharts` or a named model file differs from `origin/main` |
| `make verify` | Run all five checks above in order |
| `npm run build:cloudflare` | Build the Worker |
| `npm run preview:cloudflare` | Build and run the Worker locally with Wrangler |
| `npm run deploy:cloudflare` | Build and deploy through an authenticated local Wrangler session |
| `npm run typegen:cloudflare` | Regenerate Worker types after binding changes |
| `npm run seed` | Migrate and replace the database contents with the design seed |

Install Playwright Chromium with `npx playwright install chromium` before the first e2e run. CI runs verification and a Cloudflare build. Deployment is local.
