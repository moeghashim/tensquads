# Task 02 — Workspace frame (phase 2)

Branch: `02-frame`. One pull request. One builder agent. Starts only when `01-public-screens` is merged. Read `AGENTS.md` first and send the receipt.

## Goal

Every workspace page shares one frame: the sidebar, the agent rows with status dots, the user footer, and the chat dock with its badge. The dock sends messages through the Conversation and Bus plug-ins. The frame also makes the shared files, so that the six screen tasks can run in parallel with no conflict. `make verify` returns 0.

## Orchestrator decisions

Moe delegated these build questions. Each item uses the recommended answer in its task file. These decisions are final for phase 2. List them in the pull request.

02-frame:

1. Keep `/overview` and `/chat`. Add `/agents`, `/agents/$id`, `/traffic`, and `/rules`. All six sit under the pathless `_workspace` layout.
2. Every write goes to Neon in one transaction. The memory bus for one request is built from Neon rows. Add `bus_cursors` (`account_id`, `seq` from 100, `clock` from 11:02, `script_index` from 0).
3. `npm run seed` reads `DEMO_CLERK_USER_ID` from the environment and sets `accounts.clerk_user_id` on the demo account. When the variable is absent, the column stays null and seed does not fail. Moe has not named the user, so this task does not run seed on the database in `.env`. Tests use their own users.
4. A Clerk session with no account row goes to `/signup`.
5. Hide "All companies" for every user in phase 2. The design screenshot hides that link. The design file stays unchanged.
6. Add no sign-out control.
7. Compute the sidebar subtitle from the agent count and the account name. The seed reads "Runs 5 squads · Demo store".
8. Show `owner`. Initials are the first letters of two words, or the first two letters of an email, in capitals.
9. 02-frame owns the Chat and dock model. 02-chat keeps that model green and does not replace it.
10. Follow the design `send()` order: user bubble, master message, Task event, working line, then Result event and agent bubble.
11. Keep the design focus offset: 6 px on the chat input and 4 px on the dock input.
12. If axe rejects `aria-label` on the status dot, add `role="img"` on that span.
13. The loader runs on the server, so no loading state shows. A write shows at once. A failed write reads the data again and shows no new text. A failed read uses the default router error page.
14. A blank value shows "—". An empty list shows its heading and no rows. The frame uses this for the owner and the agent list. Screen tasks use the same rule.
15. An agent with no skills uses the skill value `-`.
16. A `send()` Result lists `writes` and has no `set`. Store the key. Change no value.
17. A reload during Working leaves the Task event and writes no Result. The test agents do not retry. A Task blocks sends for 30 seconds from its stored absolute instant. A send inside that window is ignored. A later send goes through. A Result is written only inside that same window. The displayed clock stays unchanged.
18. Add no dock scroll logic.

02-overview:

1. Average order, Profit margin, Hours saved, and the delta lines show "—" when the store has no value. An empty delta keeps its height. Tasks done is computed and shows 0.
2. The revenue panel keeps its heading and legend, with no bars, at the same height.
3. Compute Revenue from the last seven `daily_revenue` rows and Hours saved from the agents' `saved` values. Keep Orders, Average order, Profit margin, and the deltas stored. No schema change.
4. The greeting is always "Good morning", then the first word of `owner`. For an email, use the text before `@`.
5. The online pill uses the agent count.
6. `by` uses the greeting name.
7. Revising has no exit.
8. The "Demo data" pill and "Figures are demo data." stay on every account in version 1.

02-chat:

1. An empty thread shows the heading, the chips, and the input. Add no text.
2. Empty hand-offs show the heading and the sentence, with no rows.
3. Add no page scroll logic.

02-agents:

1. Keep the pending line word for word, even when it is false.
2. Keep stored `success` and `contribution`.

02-agent-detail:

1. An unknown agent id goes to `/agents`.
2. The agent loop model stays out of phase 2.
3. The test adapter passes Starting and Stopping in one step. The screen shows Running for On and Paused for the rest.
4. "A skill cannot run when Off" covers `send()` only. `nextEvent()` is a replay.
5. All skills off follows the code and uses the first skill. Report the difference.
6. Leave `accounts.online`.
7. A new account dashboard uses frame item 14. The "Pending approval" mission text stays unchanged.

02-traffic:

1. Add `--color-rgba-13-13-13-2` and one `OVERRIDES.md` row. 02-traffic owns those files, so 02-frame does not add the token.
2. A filter may hide the selected row. The inspector keeps the event.
3. An empty bus shows both inspector cards, with headings, blank values, and "None", and no list rows.
4. The script runs as written. A missing name shows its id. Only real agents get a hub node.
5. `nextEvent()` is a replay.
6. The model covers Queued, Delivered, Acknowledged, and Dead letter. The test adapter passes Queued to Acknowledged in one step.

02-rules:

1. A limit change writes state directly and writes no event in version 1.
2. The slider updates at once. One write runs at a time for each key. The last value always goes out.
3. A new account shows the rules card with no rows and defaults to the first agent.
4. The default ad cap is 200. 02-rules updates `create-workspace.ts` and its test. 02-frame does not change that file.

`live.ts` is created empty. The provider calls `runLiveTick({ live, refresh })` every 3,500 ms. 02-traffic fills the body and does not change the call.

## Read

- `docs/PLAN.md`: Decisions (all), Architecture, State models (Chat and dock, Approval), Phases (phase 2)
- `docs/BRIEF.md`: Screens and routes (Shells, Who sees what), Data model, Behaviour (Workspace, all pages; Chat), Design tokens, Definition of done
- `design/Main.dc.html`: in full, with the script. Frame lines: helmet CSS 13-22, shell 24, sidebar 64-112, main 115, dock 897-948, `route()` 1115-1126, `send()` 1128-1163, chat view values 1246-1253, frame values 1421-1443
- `design/inventory/Main.json`
- `apps/web/src/design/OVERRIDES.md`, `docs/foundation.md`
- `e2e/support.ts`, `e2e/session.spec.ts`, `apps/web/src/server/session.ts`, `apps/web/src/server/create-account.ts`, `packages/adapters/src/neon/create-workspace.ts`

## Steps, in order

1. Add this task file in the first commit. Get Moe's answers to "Stop and ask" before step 2.
2. Write the Chat and dock state model in `packages/statecharts/chat-dock` with the `statechart` skill, before its code. States: Idle, Working, Replied. Rules are in `docs/PLAN.md` "State models", as corrected by item 10 below. Name the code files in its `# model:` comment. TLC must report no broken rule.
3. Make the data foundation. Add the `bus_cursors` table from item 2 with a Drizzle migration. Add `platform.accountForClerkUser`. Add `requireWorkspace` in `apps/web/src/server/workspace.ts`. It checks the session, returns an `AccountScope`, and opens and closes the repositories. Every workspace server function uses it. The Worker bundle guard must stay green.
4. Make the slot files in the table below. Wire each one into its package index, into `RepositoryBag`, and into `createRepositories`. A slot starts empty and typed. After this step, no screen task needs to change an index file.
5. Split `packages/kernel/src/plugins.ts` into `packages/kernel/src/plugins/`, one file per area, plus the policy slots. `kernel.ts` stays the only cordis import. The six plug-in names do not change.
6. Build `appendEvents(tx, accountId, drafts)` in `packages/adapters/src/neon/commands/bus.ts`. It stamps the id, time and trace, adds the row, and applies each `set`, all in the caller's transaction (`Main.dc.html:1091-1097`). Every event writer uses it. Its signature does not change after this task.
7. Build the send path in the Conversation plug-in, with `conversation` commands in `packages/adapters/src/neon/commands/conversation.ts`. It follows `route()` and `send()` exactly, in two steps. The first step writes the user message, the master message and the Task event. The second step runs 1,400 ms later in the browser. It writes the Result event and the agent message, adds one to `tasks`, and sets `last`. Copy every reply string word for word. Make the thread row at the first send when it does not exist.
8. Build `apps/web/src/workspace/`: `WorkspaceProvider`, `Sidebar`, `Dock`, `styles.ts`, `agent-view.ts`, `event-view.ts`, and `workspace.css`.
   - `WorkspaceProvider` is client state that lives above the routes. It holds `draft`, `dockOpen`, `thinking`, `thinkingAgent`, `selEvent`, `busFilter`, `live`, and the rule form. These reset on a page reload, as in the design. It runs the 3,500 ms timer (`Main.dc.html:1081`) on every page and calls `runLiveTick` from `live.ts`. It gives `useRefresh()`, which reloads the route data after a write.
   - `styles.ts` holds `pill`, `kindStyle`, `gateStyle`, `navStyle` and the switch values (`Main.dc.html:1198-1204`).
   - `agent-view.ts` holds `missionBits` and the agent values (`Main.dc.html:1209-1222`). `event-view.ts` holds `decorate` and `useInspect` (`Main.dc.html:1206`). `useInspect` sets `selEvent` and opens `/traffic`.
   - `workspace.css` holds the hover rules and the focus rule from `Main.dc.html:13-22`, and `strong { font-weight: 600 }`. The design loads Inter up to 600, so its `<strong>` shows at 600. The root loads 700 for the homepage.
9. Build the pathless layout `apps/web/src/routes/_workspace.tsx`. It calls `requireWorkspace`, reads the frame data in one loader, and renders the frame. Move the blank `/overview` and `/chat` pages under it. Add blank pages for `/agents` (`agents.index.tsx`), `/agents/$id` (`agents.$id.tsx`), `/traffic` (`traffic.tsx`) and `/rules` (`rules.tsx`). Every blank page needs a session. Keep `routeTree.gen.ts` in git. The screen tasks replace only these route files, so the generated tree does not change again.
10. Set each page title from the design file: `/overview` "tensquads workspace" (`Main.dc.html:5`), `/chat` "Chat with the master", `/agents` "Agents", `/agents/$id` "Agent dashboard", `/traffic` "Agent traffic", `/rules` "Rules and limits". The screen tasks do not change these.
11. Build the test helpers in `e2e/workspace.ts`. `e2e/support.ts` changes only to accept a label that wraps its input, and to check `select`.
    - `workspaceTest`: one Clerk test user per Playwright worker, and one fresh copy of the demo workspace before each test. A test owns its rows, so `fullyParallel` stays on. `saveWorkspace` is not usable here, because it replaces all rows. Add `packages/seed/src/demo-account.ts` to write the demo rows for one account id. It reuses `demoData()` from `packages/seed/src/workspace.ts`, so a seed change reaches the tests.
    - `mainSection(name)`: cuts one section from `design/Main.dc.html` at its comment markers. It returns the texts, handlers and loops for the inventory check, with the same regular expressions as `scripts/design-inventory.mjs`.
    - Keep the `data-handler` attribute from task 01 on every control.
12. Update `e2e/session.spec.ts`. It asserts a blank `main` and the title "tensquads". Those assertions are false after this task.
13. Split `.agents/skills/tensquads-verify`. Each model gets one file under `models/`. `SKILL.md` says to read them all. Add `models/chat-dock.md`. Screen tasks add one file each and do not edit `SKILL.md`. `scripts/statechart-check.mjs` finds models by folder, so it needs no change.
14. Add `e2e/frame.spec.ts` with the behaviour tests below. Add the screenshot comparison at 1440 px and 390 px for the sidebar, the closed dock and the open dock. Run the inventory comparison for `Sidebar` and `CHAT DOCK`.
15. Check the seed tests. Measure the frame loader: report the query count and the time in the pull request. Deploy to the Cloudflare preview. Check that each new route returns 200 with a session.
16. Rebase on `main` last. Then append one line to `progress.md` with the commit script.

### Files for parallel work

Each file has one owner. A branch that must change a file it does not own stops and asks.

| Files | Owner |
| --- | --- |
| `apps/web/src/routes/_workspace.tsx`, `routeTree.gen.ts`, `apps/web/src/workspace/**` except `live.ts`, `apps/web/src/server/workspace.ts` | 02-frame |
| `packages/domain/src/index.ts`, `packages/domain/src/repositories.ts`, `packages/adapters/src/index.ts`, `packages/adapters/src/neon/repositories.ts`, `packages/adapters/src/neon/schema.ts`, `migration.sql`, `migration-sql.ts`, `packages/kernel/src/index.ts` | 02-frame |
| `packages/adapters/src/neon/commands/bus.ts`, `conversation.ts`, `packages/kernel/src/plugins/conversation.ts`, `packages/seed/src/demo-account.ts`, `e2e/support.ts`, `e2e/workspace.ts` | 02-frame |
| `packages/domain/src/policy/approval-commands.ts`, `packages/adapters/src/neon/commands/approvals.ts`, `packages/kernel/src/plugins/policy-approvals.ts`, `packages/domain/src/policy/decide.ts`, `packages/seed/src/workspace.ts` | 02-overview |
| `packages/domain/src/squads/agent-commands.ts`, `packages/adapters/src/neon/commands/agents.ts`, `packages/kernel/src/plugins/squads.ts`, `packages/kernel/src/ports.ts`, `packages/adapters/src/test-machine.ts` | 02-agent-detail |
| `packages/domain/src/bus/traffic-commands.ts`, `packages/adapters/src/neon/commands/traffic.ts`, `packages/kernel/src/plugins/bus.ts`, `packages/adapters/src/memory-bus.ts`, `apps/web/src/workspace/live.ts`, `apps/web/src/design/tokens.css`, `apps/web/src/design/OVERRIDES.md` | 02-traffic |
| `packages/domain/src/policy/rule-commands.ts`, `packages/adapters/src/neon/commands/rules.ts`, `packages/kernel/src/plugins/policy-rules.ts`, `packages/adapters/src/neon/create-workspace.ts` | 02-rules |

Each screen also owns its route file under `apps/web/src/routes/_workspace/`, its `apps/web/src/screens/<screen>/` folder, its `apps/web/src/server/<screen>.ts`, its `e2e/<screen>.spec.ts` with snapshots, and its model folder. `progress.md` is the one file all branches touch, so the line goes in after the last rebase. No screen task adds a package, a migration or a colour, except where its own file says so.

### Tests that need two screens

No screen waits for another. The branch that merges second adds the test when it rebases. Phase 2 is not complete until all five files exist.

| Test file | It proves | Branches |
| --- | --- | --- |
| `e2e/cross-approval-traffic.spec.ts` | Approve on Overview shows the Approval event and `approvals.ap1` on Traffic | 02-overview, 02-traffic |
| `e2e/cross-revise-overview.spec.ts` | "Ask Master to revise" on Support shows the Revising card on Overview | 02-agent-detail, 02-overview |
| `e2e/cross-handoff-traffic.spec.ts` | A hand-off click opens Traffic with that event in the inspector | 02-chat, 02-traffic |
| `e2e/cross-messages-traffic.spec.ts` | A message click on the agent dashboard opens Traffic with that event in the inspector | 02-agent-detail, 02-traffic |
| `e2e/cross-limit-traffic.spec.ts` | A slider and the Traffic state table show the same `policy.*` value | 02-rules, 02-traffic |

### State model

This task owns Chat and dock. It reads the Approval model for the badge and does not change it.

### Behaviour tests

Each row is one test in `e2e/frame.spec.ts`.

| Behaviour line | Test title |
| --- | --- |
| `docs/BRIEF.md` Workspace: Sidebar nav highlights the current page; agent rows show a green dot when on, grey when off, and open that agent's dashboard | `the sidebar marks the current page and the agent rows show status and open the dashboard` |
| `docs/BRIEF.md` Workspace: Chat dock button, orange badge with the count, open panel with six messages, three chips, input and "Open full chat", hidden on the chat page | `the dock shows the badge, opens the panel, and hides on the chat page` |
| `docs/BRIEF.md` Chat: Sending a message appends the user bubble, shows the working line, then the reply and the bus events. Enter sends | `a dock message shows the bubble, the working line, the reply, and writes the events` |
| `Main.dc.html:1135-1137` no agent matches | `a message with no agent gets the master answer and no event` |
| `Main.dc.html:1139-1142` the agent is off | `a message to a paused agent gets the paused answer and no event` |
| `Main.dc.html:1130` empty text, or send during Working | `an empty message or a second send does nothing` |

"Hidden on super-admin pages" has no page until phase 3. Phase 3 tests it. The chat page half of "shares the thread and draft" is in `tasks/02-chat.md`.

## Done when

- [ ] Every item under "What done means" in `AGENTS.md` passes for the frame, with evidence: screenshots, tests, inventory, keyboard, 390 px
- [ ] `packages/statecharts/chat-dock/chart.mmd` exists and TLC reports no broken rule
- [ ] Each behaviour row above is one passing test
- [ ] The badge shows 4 with the seed loaded, and `/overview`, `/chat`, `/agents`, `/agents/support`, `/traffic` and `/rules` open in the frame
- [ ] A visitor with no session goes to `/signin` from each of those routes
- [ ] Each slot file exists, is wired in, and passes the type check
- [ ] A message sent in one test does not change the data of a parallel test
- [ ] The seed tests still pass with the nine numbers
- [ ] `node scripts/design-check.mjs` returns 0
- [ ] `make verify` returns 0 on the branch and in CI

## Stop and ask

Ask Moe, in a numbered list. Items 1 to 8, and items 13 and 14, affect every screen task.

1. **Route paths.** `docs/BRIEF.md` says `/app`. `docs/PLAN.md` says `src/routes/app/`. Task 01 made `/overview` and `/chat`. Recommended: keep `/overview` and `/chat`, add `/agents`, `/agents/$id`, `/traffic` and `/rules`, all under the pathless `_workspace` layout.
2. **Where writes go.** Decision 16 says version 1 uses an in-memory bus. A Worker holds no memory between requests, and the screens read Neon. The Durable Object is phase 4. Recommended: every write goes to Neon in one transaction. Build the memory bus for one request from Neon rows. Add `bus_cursors` (`account_id`, `seq` from 100, `clock` from 11:02, `script_index` from 0), so ids and times follow `Main.dc.html:959` and `:1051`.
3. **Demo account owner.** The seeded `demo` account has no Clerk user, so no person can open it on the preview. Recommended: `npm run seed` reads `DEMO_CLERK_USER_ID` from `.env` and sets `accounts.clerk_user_id`. Moe gives the Clerk user.
4. **Session with no account.** A Clerk user can have no account row. The design has no such state. Recommended: send that user to `/signup`.
5. **"All companies" link.** The design shows it at all times. `docs/BRIEF.md` shows it only to a super admin, and that role is phase 3. Recommended: hide it for all users in phase 2. List it as an approved difference, and take the design screenshot with the link hidden.
6. **Sign out.** The design has no sign-out control. Recommended: add none in phase 2. Moe adds one to the design if he wants it.
7. **Sidebar text.** "Runs 5 squads · Demo store" is fixed text at `Main.dc.html:74`. Recommended: compute the count and the account name. The seed gives the same text.
8. **Owner name.** The footer shows "MG" and "Moe Ghashim" as fixed text. Task 01 stores the email as `owner` for a new account. Recommended: show `owner`. The initials are the first letters of two words, or the first two letters of an email, in capitals.
9. **Model owner.** `docs/PLAN.md` puts Chat and dock with screen 4, and says each screen adds its model. The dock needs `send()` first. Recommended: 02-frame owns the model, and 02-chat keeps it green.
10. **`send()` order.** `docs/PLAN.md` says: bubble, working line, master reply, one bus event. The design writes the bubble, a master message and a Task event, shows the working line, then writes a Result event and an agent bubble (`Main.dc.html:1151-1161`). Recommended: follow the design, and write that order into the model.
11. **Input focus offset.** `AGENTS.md` says a 2 px offset. The design sets 6 px on the chat input and 4 px on the dock input (`Main.dc.html:523`, `:934`). Recommended: keep the design values, and list them as an approved difference.
12. **Status dot label.** The design puts `aria-label` on a plain `span` (`Main.dc.html:103`). If axe rejects it, recommended: add `role="img"`. It changes nothing on screen.
13. **Loading and errors.** The design shows neither, and decision 8 says Moe decides for each screen. Recommended: the loader runs on the server, so no loading state shows. A write shows at once. If it fails, the page reads the data again and shows no new text. A failed read uses the default router error page.
14. **New account fields.** A new account has empty `success`, `saved`, `last` and machine fields, and no skills, targets or KPIs. Recommended: a blank value shows "—". An empty list shows its heading and no rows.
15. **`send()` on an agent with no skills.** `skill.id` fails at `Main.dc.html:1150-1151` for a new account. Recommended: use the skill value `-`, as `decide()` does.
16. **Writes with no value.** A `send()` Result names `writes` but has no `set`, so the design changes no state value. `docs/PLAN.md` says the core writes them. Recommended: follow the design. List the key, change no value.
17. **Reload during Working.** The second step runs in the browser, so a reload stops it. Recommended: the Task event stays with no Result. The test agents do not retry.
18. **Dock scroll.** The dock has no scroll logic, so the newest message can sit below the fold. Recommended: add none, as in the design.

Also stop and ask for any state the design does not show that this file does not cover.

## Do not

- Do not build the content of any screen. Each blank page stays blank until its task.
- Do not build approve, the agent switches, `nextEvent()`, or the rule and limit writes. The slot owners build them.
- Do not build the Durable Object, the Queue consumer, the Cloudflare bus or the boat.dev adapter. That is phase 4.
- Do not build the super-admin role or the admin pages. That is phase 3.
- Do not replace the stored `success` value or add the metrics table. It stays out of phase 2. No file in this task replaces it.
- Do not add a text string, colour, font, radius or shadow beyond this file and the design.
- Do not change anything under `design/`.
- Do not edit `docs/PLAN.md` or `docs/BRIEF.md`. Report each difference in the pull request.
