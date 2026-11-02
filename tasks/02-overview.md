# Task 02 — Overview, screen 3 (phase 2)

Branch: `02-overview`. One pull request. One builder agent. Starts only when 02-frame is merged. Runs in parallel with the other screen tasks. Read `AGENTS.md` first and send the receipt.

## Goal

`/overview` replaces the blank page from task 01. It shows the greeting, the mission, six KPI tiles, the 14-day revenue bars, the approval inbox and the agent cards. It matches the design at 1440 px and 390 px. Approve and Decline work through the Policy plug-in. The system computes Tasks done = 331. It does not store it. `make verify` returns 0.

## Read

- `docs/PLAN.md`: Decisions (all), Architecture ("Some rules cross domain areas", "Where the data lives"), State models (Approval), Phases (phase 2)
- `docs/BRIEF.md`: Screens and routes (Overview), Data model (Approval, Agent), Behaviour (Overview), Definition of done
- `design/Main.dc.html`: in full, with the script. Screen lines: 360-493. Script lines: 1165-1190, 1209-1239, 1429
- `design/inventory/Main.json`, section `OVERVIEW`
- `tasks/02-frame.md`: "Files for parallel work", "Tests that need two screens"
- `.agents/skills/tensquads-verify/`, `packages/domain/src/policy/decide.ts`, `packages/statecharts/approval/`

## Steps, in order

1. Add this task file in the first commit. Get Moe's answers to "Stop and ask" before step 2.
2. Read the Approval state model. It exists from phase 0. Add the bus event write from `decide()` to the model. Approve and Decline each add one event and one `approvals.<id>` state key. TLC must report no broken rule. Update `.agents/skills/tensquads-verify/models/approval.md`.
3. Fill the slots. `approval-commands.ts`, `commands/approvals.ts` and `policy-approvals.ts` give `decide(scope, id, ok)` and `decideMission(scope, id, ok)`. Each runs in one transaction. Use `decideApproval` and `decideMission` from `packages/domain/src/policy/decide.ts`. `decide` also calls `appendEvents` with the event at `Main.dc.html:1167`, including its `set`. `decideMission` adds no event (`Main.dc.html:1175-1184`). A repeat call on a decided item changes nothing.
4. Compute Tasks done. The tile value is `squads.tasksDone(scope)`. Remove the tile from the stored data: filter "Tasks done by squads" out of `tiles` in `packages/seed/src/workspace.ts`, and add it back at position 5 when the screen reads the tiles. A seed test asserts that no `overview_tiles` row holds this tile and that the screen value is 331.
5. Build `apps/web/src/server/overview.ts` and `apps/web/src/screens/overview/`. Replace `apps/web/src/routes/_workspace/overview.tsx`. Keep the one-request-per-page rule: group the reads in one loader. Measure the loader, and report the query count and the time in the pull request (`docs/PLAN.md` "Risks").
6. Build the screen from `Main.dc.html:360-493`. Keep `Math.round(v / 1500 * 100)` for the bars (`Main.dc.html:1227`). The cards use `agent-view.ts` from the frame. "See squad traffic" opens `/traffic`. A card opens `/agents/<id>`. Call `useRefresh()` after each write, so the sidebar, the dock badge and the cards show the new values.
7. Add `e2e/overview.spec.ts` with the behaviour tests below. Add the screenshot comparison at 1440 px and 390 px, and the inventory comparison with `mainSection("OVERVIEW")`.
8. Report these differences in the pull request: the design says "Tasks done by squads", the brief says "Tasks done by agents". The design inbox also holds mission proposals, and the badge counts them, so the seed shows 4.
9. Add a test from `tasks/02-frame.md` "Tests that need two screens" if the other branch is on `main`.
10. Rebase on `main` last. Then append one line to `progress.md` with the commit script.

### Files

This branch adds its screen folder, `apps/web/src/server/overview.ts`, `e2e/overview.spec.ts` with snapshots. It changes `apps/web/src/routes/_workspace/overview.tsx`, `packages/domain/src/policy/approval-commands.ts`, `packages/adapters/src/neon/commands/approvals.ts`, `packages/kernel/src/plugins/policy-approvals.ts`, `packages/seed/src/workspace.ts`, `packages/statecharts/approval/**`, `.agents/skills/tensquads-verify/models/approval.md`. `packages/domain/src/policy/decide.ts` and its test are changed only by this branch. 02-rules and 02-agent-detail do not edit them. Change no other file.

### State model

This task owns Approval.

### Behaviour tests

Each row is one test in `e2e/overview.spec.ts`.

| Behaviour line | Test title |
| --- | --- |
| `docs/BRIEF.md` Screens: Greeting, 6 KPI tiles, 14-day revenue bars, approval inbox, agent cards | `the overview shows the greeting, six tiles, fourteen bars, the inbox and five cards` |
| `docs/BRIEF.md` Overview: KPI "Tasks done by agents" is the sum of every agent's tasks. The online pill counts agents with on | `the tile shows the computed 331 and the pill shows 4 of 5 squads online` |
| `docs/BRIEF.md` Overview: Approve adds one task to that agent and sets its last to the approval title plus " (approved)" | `approve adds one task and sets the last line` |
| `docs/BRIEF.md` Overview: Decline removes it | `decline removes the approval and changes no agent` |
| `docs/BRIEF.md` Overview: Empty inbox shows the "Nothing waiting" copy | `an empty inbox shows the nothing waiting text and no badge` |
| `Main.dc.html:1176-1180` Approve mission | `approve mission sets the mission, the targets and zero contribution` |
| `Main.dc.html:1182`, `:433` Ask for another | `ask for another shows the revising text and lowers the count` |
| `Main.dc.html:461`, `:465` links | `see squad traffic and each card open their pages` |

## Done when

- [ ] Every item under "What done means" in `AGENTS.md` passes for `/overview`, with evidence: both 1440 px images, tests, inventory, keyboard, 390 px
- [ ] Each behaviour row above is one passing test
- [ ] With the seed loaded the tile shows 331, computed by `squads.tasksDone`. No stored row holds that tile
- [ ] Approve changes the tile to 332 and the dock badge from 4 to 3
- [ ] `packages/statecharts/approval/chart.mmd` matches the model and TLC reports no broken rule
- [ ] The loader's query count and time are in the pull request
- [ ] The seed tests still pass with the nine numbers
- [ ] `node scripts/design-check.mjs` returns 0
- [ ] `make verify` returns 0 on the branch and in CI

## Stop and ask

Ask Moe, in a numbered list. Items 13 and 14 in `tasks/02-frame.md` apply to this screen.

1. **Tiles with no store.** Decision 25 covers Revenue and Orders. It does not cover Average order, Profit margin, Hours saved, or the delta lines. Recommended: those three also show "—", and an empty delta line keeps its height. Tasks done is still computed and shows 0.
2. **Revenue panel with no store.** The design shows no empty chart. Recommended: keep the panel, the heading and the legend, with no bars and no labels, at the same height.
3. **Other stored totals.** `AGENTS.md` says never store a sum, and `overview_tiles` stores the Revenue and Hours saved tiles as text. Revenue is the sum of the last seven `daily_revenue` rows ($8,420). Hours saved is the sum of the agents' `saved` values (34h). Recommended: compute these two, with no schema change. Keep Orders, Average order, Profit margin and the deltas stored, because they have no source rows yet.
4. **Greeting.** "Good morning, Moe" is fixed text. Recommended: always "Good morning", then the first word of `owner`. For an email owner, use the text before the `@`.
5. **Online pill.** "of 5 squads" is fixed text at `Main.dc.html:371`. Recommended: use the agent count.
6. **`by: 'Moe'`.** The event payload has a fixed name at `Main.dc.html:1167`. Recommended: use the greeting name.
7. **Revising has no exit.** The design has no path out of Revising, so that card stays and the inbox never becomes empty. Recommended: keep this, as in the design.
8. **"Demo data" on a real account.** The pill and "Figures are demo data." are fixed text. Recommended: keep them on every account in version 1.

Also stop and ask for any state the design does not show that this file does not cover.

## Orchestrator decisions

Moe delegated these answers. Each item uses the recommended answer.

1. Tiles with no store show "—" for Average order, Profit margin, and Hours saved. An empty delta keeps its height. Tasks done is computed and shows 0.
2. A revenue panel with no store keeps the panel, the heading, and the legend. It has no bars and no labels. The panel keeps the same height.
3. Revenue is the sum of the last seven `daily_revenue` rows. Hours saved is the sum of the agents' `saved` values. There is no schema change. Orders, Average order, Profit margin, and the deltas stay stored.
4. The greeting is always "Good morning", then the first word of `owner`. An email owner uses the text before `@`. An empty name shows "—", so the line is "Good morning, —".
5. The online pill uses the agent count: `${online} of ${total} squads online`.
6. The event field `by` and the Mandate field `saidYes` use the greeting name.
7. Revising has no exit. The card stays. The inbox does not become empty while a Revising proposal remains.
8. The "Demo data" pill and "Figures are demo data." stay on every account in version 1.
9. Frame item 13. The loader runs on the server. The screen has no loading state. A write shows at once. A failed write reads the page again and shows no new text. A failed read uses the default router error page.
10. Frame item 14. A blank value shows "—". An empty list shows its heading and no rows. An empty proposal mission shows "—". "Mission pending. Your Master will propose one." is not design copy. The Revising line stays the design sentence.
11. Decision 32. Approve writes the Mandate in the same transaction as the Approval. The Mandate records the first On rule for that agent whose approval is not "Auto", the limit value at that time, the policy version, the greeting name, and the time. The limit key is `policy.refund_auto_limit` for support, `policy.daily_ad_cap` for marketing, and `policy.reorder_limit` for inventory. The policy version is a stable FNV-1a hash of the current rules, prefixed with `policy-`. A later rule change does not rewrite a stored Mandate. Pending and Declined have no Mandate. A missing rule or a missing limit rolls the transaction back.

## Do not

- Do not store the Tasks done value. Do not read `accounts.tasks` for this tile. That column stays for phase 3.
- Do not replace the stored `success` value, the stored `contribution` value, or add the metrics table. They stay out of phase 2. No file in this task replaces them.
- Do not change the frame, the indexes, the schema or `e2e/support.ts`.
- Do not build another screen. A link to another screen may open a blank page until that task merges.
- Do not add a text string, colour, font, radius or shadow beyond this file and the design.
- Do not change anything under `design/`.
- Do not edit `docs/PLAN.md` or `docs/BRIEF.md`. Report each difference in the pull request.
