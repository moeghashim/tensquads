# Task 02 — Agent traffic, screen 7 (phase 2)

Branch: `02-traffic`. One pull request. One builder agent. Starts only when 02-frame is merged. Runs in parallel with the other screen tasks. Read `AGENTS.md` first and send the receipt.

## Goal

`/traffic` shows the messaging rules, the hub of master and agents, the filter chips, the event list, the inspector with payload and state writes, the shared state table, the Live toggle and "Send next event". `nextEvent()` runs in the Bus plug-in. It adds one event and applies its writes in one step. It matches the design at 1440 px and 390 px. `make verify` returns 0.

## Orchestrator decisions

Moe delegated these build questions. Each item uses the recommended answer. These decisions are final for this screen.

1. Add `--color-rgba-13-13-13-2` and one `OVERRIDES.md` row for `rgba(13,13,13,.2)`.
2. A filter may hide the selected row. The inspector keeps the event. The model rule covers the inspector, not the row.
3. An empty bus shows both inspector cards, with headings, blank values, and "None", and no list rows. The kind pill is omitted. The mission delta is "None".
4. The script runs as written. A missing name shows its id. Only real agents get a hub node. Hub counts use the full bus.
5. `nextEvent()` is a replay. It runs a skill while that agent is off.
6. The model covers Queued, Delivered, Acknowledged, and Dead letter. The test adapter passes Queued to Acknowledged in one step. The screen does not show those four names.

Frame items 2, 13, 14, and 16 also apply. The traffic command writes to Neon in one transaction. The memory bus for that request is built from the Neon rows. There is no loading state. A failed write reads the data again and shows no new text. Item 3 above replaces the frame's "—" rule for the empty traffic inspector.

## Read

- `docs/PLAN.md`: Decisions (4, 16, 17 and all others), Architecture ("How agents send messages"), State models (Bus event and shared state, Rules and limits), Phases (phase 2)
- `docs/BRIEF.md`: Screens and routes (Agent traffic), Data model (Bus event, Shared state), Behaviour (Agent traffic), Definition of done
- `design/Traffic.dc.html` and `design/Main.dc.html`: in full, with the script. Screen lines: 719-827. Script lines: 1081, 1091-1113, 1281-1307, 1444-1447
- `design/inventory/Traffic.json` (a wrapper) and `design/inventory/Main.json`, section `TRAFFIC`
- `tasks/02-frame.md`: "Files for parallel work", "Tests that need two screens"
- `packages/adapters/src/memory-bus.ts`, `packages/adapters/src/neon/commands/bus.ts` (read only)

## Steps, in order

1. Add this task file in the first commit. Get Moe's answers to "Stop and ask" before step 2.
2. Write the Bus event and shared state model in `packages/statecharts/bus` with the `statechart` skill, before its `nextEvent` code. States: Queued, Delivered, Acknowledged, Dead letter; Live, Paused, Selected event. Rules are in `docs/PLAN.md` "State models". Include `appendEvents` from the frame. Name the code files in its `# model:` comment. TLC must report no broken rule. Add `.agents/skills/tensquads-verify/models/bus.md`. If TLC finds a fault in `appendEvents`, stop and ask. Its signature does not change, and other branches call it.
3. Fill the slots. `traffic-commands.ts`, `commands/traffic.ts` and `plugins/bus.ts` give `nextEvent(scope)`. Add a `cursor` input to `createMemoryBus`. The command reads the events, the store and the cursor, runs one `nextEvent()`, and saves through `appendEvents` in one transaction. `index % script.length` wraps the script (`Main.dc.html:1110`). A repeat id changes nothing. Read the script from `design.script` in `packages/seed/src/design.json` with a static import. The Worker bundle guard must stay green.
4. Fill `apps/web/src/workspace/live.ts`: `runLiveTick` calls `nextEvent`, then the refresh. The timer in the frame provider runs on every page, so Live continues away from this page (`Main.dc.html:1081`).
5. Add `rgba(13,13,13,.2)` to `tokens.css` and to `OVERRIDES.md`, after Moe answers item 1.
6. Build `apps/web/src/server/traffic.ts` and `apps/web/src/screens/traffic/`. Replace `apps/web/src/routes/_workspace/traffic.tsx`. The loader reads the events by sequence number, the store and the hub counts. Do not sort by time.
7. Build the screen from `Main.dc.html:719-827`. Copy `messagingRules` and `deltaBySkill` word for word (`Main.dc.html:1296-1302`). The filter and the hub share `busFilter` from the provider. A hub click on the selected node clears it (`Main.dc.html:1292`). With no `selEvent` set, select the second event, as the seed does (`Main.dc.html:1043`). If that id is not found, select the last event (`Main.dc.html:1295`). The inspector JSON follows `Main.dc.html:1306`. State values show with `String()` in store order (`Main.dc.html:1307`).
8. Add `e2e/traffic.spec.ts` with the behaviour tests below. Use the Playwright clock for the 3,500 ms timer. Add the screenshot comparison at 1440 px and 390 px, at the 1500 px artboard height, and the inventory comparison with `mainSection("TRAFFIC")`. The design makes a random trace, so mask the Trace value and the `trace_id` line in the comparison.
9. Report these differences in the pull request: the design says "Send next event", the brief says "Simulate". The chip says "All agents" and the nav says "Squad traffic".
10. Add a test from `tasks/02-frame.md` "Tests that need two screens" if the other branch is on `main`.
11. Rebase on `main` last. Then append one line to `progress.md` with the commit script.

### Files

This branch adds its screen folder, `apps/web/src/server/traffic.ts`, `e2e/traffic.spec.ts` with snapshots, `packages/statecharts/bus/**`, and `.agents/skills/tensquads-verify/models/bus.md`. It changes `apps/web/src/routes/_workspace/traffic.tsx`, `packages/domain/src/bus/traffic-commands.ts`, `packages/adapters/src/neon/commands/traffic.ts`, `packages/kernel/src/plugins/bus.ts`, `packages/adapters/src/memory-bus.ts`, `apps/web/src/workspace/live.ts`, `apps/web/src/design/tokens.css`, `apps/web/src/design/OVERRIDES.md`. Change no other file.

### State model

This task owns Bus event and shared state. The Rules and limits model is in `tasks/02-rules.md`. This screen only reads the `policy.*` keys. The Agent loop model stays out of phase 2.

### Behaviour tests

Each row is one test in `e2e/traffic.spec.ts`.

| Behaviour line | Test title |
| --- | --- |
| `docs/BRIEF.md` Screens: Hub diagram, filter chips, event list, inspector, shared state table, Live toggle, Simulate button | `traffic shows the hub, the chips, the list, the inspector, the state table and both controls` |
| `docs/BRIEF.md` Traffic: Clicking a hub node filters the event list to that agent | `a hub click filters the list to that agent` |
| `docs/BRIEF.md` Traffic: clicking again clears | `a second hub click clears the filter` |
| `docs/BRIEF.md` Traffic: Clicking an event selects it and the inspector shows route, skill, trace, JSON payload and state writes | `an event click fills the inspector` |
| `docs/BRIEF.md` Traffic: Live toggle steps through nextEvent() | `live adds one event every 3.5 seconds, on any page, until paused` |
| `docs/BRIEF.md` Traffic: Simulate steps through nextEvent(), which appends the next scripted event and applies its writes to the shared state | `send next event adds the event, selects it and updates the state table` |
| `Main.dc.html:1283` chips | `a filter chip filters the list and All agents clears it` |
| `Main.dc.html:1304-1305` delta | `a Result shows its mission delta and other kinds show None` |
| `Main.dc.html:1110` wrap | `the script starts again after eight events with new ids` |

## Done when

- [ ] Every item under "What done means" in `AGENTS.md` passes for `/traffic`, with evidence: both 1440 px images, tests, inventory, keyboard, 390 px
- [ ] Each behaviour row above is one passing test
- [ ] A unit test proves that one `nextEvent` adds one row and applies all its writes in one transaction, and that a repeat id changes nothing
- [ ] Events show in sequence order, not time order
- [ ] The Inventory node shows at 60% opacity with the seed (`Main.dc.html:1293`)
- [ ] `packages/statecharts/bus/chart.mmd` exists and TLC reports no broken rule
- [ ] The seed tests still pass with the nine numbers
- [ ] `node scripts/design-check.mjs` returns 0
- [ ] `make verify` returns 0 on the branch and in CI

## Stop and ask

Ask Moe, in a numbered list. Items 2, 13, 14 and 16 in `tasks/02-frame.md` apply to this screen.

1. **Colour outside the tokens.** `rgba(13,13,13,.2)` is at `Main.dc.html:752`, `:753` and `:1291`. It is not in `tokens.css` or `OVERRIDES.md`. Recommended: add `--color-rgba-13-13-13-2` and one row in `OVERRIDES.md`.
2. **"A filter never hides the selected event."** In the design a filter can remove the selected row from the list, and the inspector keeps the event (`Main.dc.html:1286`, `:1295`). Recommended: follow the design. The model rule covers the inspector, not the row.
3. **Empty bus.** A new account has no events, and the design then reads `ev.kind` of nothing (`Main.dc.html:1295`, `:1303`). Recommended: show both inspector cards with their headings, with blank values and "None", and no list rows.
4. **Script and missing agents.** The script names five agents. A new account can have others. Recommended: run the script as written. A missing name shows its id (`Main.dc.html:1197`), and only real agents get a hub node.
5. **"A skill cannot run when its agent is Off."** `nextEvent()` runs Inventory's skills while it is off. Recommended: treat `nextEvent()` as a replay, the same answer as item 4 in `tasks/02-agent-detail.md`.
6. **Bus states with no screen.** Queued, Delivered, Acknowledged and Dead letter do not show. No Dead letter can happen with the in-memory bus. Recommended: the model covers all of them. The test adapter passes from Queued to Acknowledged in one step. The Cloudflare bus in phase 4 uses them.

Also stop and ask for any state the design does not show that this file does not cover.

## Do not

- Do not change `appendEvents`, the provider, the frame, the indexes, the schema or `e2e/support.ts`.
- Do not build the Durable Object, the Queue consumer or the Cloudflare bus. That is phase 4.
- Do not push events to the browser. Version 1 refreshes after each step.
- Do not replace the stored `success` value or add the metrics table. It stays out of phase 2. No file in this task replaces it.
- Do not add a text string, font, radius or shadow beyond this file and the design. The only new colour is item 1, after Moe answers.
- Do not change anything under `design/`.
- Do not edit `docs/PLAN.md` or `docs/BRIEF.md`. Report each difference in the pull request.
