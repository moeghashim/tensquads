# Task 02 — Rules and limits, screen 8 (phase 2)

Branch: `02-rules`. One pull request. One builder agent. Starts only when 02-frame is merged. Runs in parallel with the other screen tasks. Read `AGENTS.md` first and send the receipt.

## Goal

`/rules` shows the rules list with switches, the new-rule form, and three limit sliders bound to the shared state. It matches the design at 1440 px and 390 px. A slider and the Traffic state table always show the same `policy.*` value, because both read the same key. `make verify` returns 0.

## Read

- `docs/PLAN.md`: Decisions (all), Architecture ("Some rules cross domain areas"), State models (Rules and limits), Phases (phase 2)
- `docs/BRIEF.md`: Screens and routes (Rules and limits), Data model (Rule, Shared state), Behaviour (Rules and limits), Definition of done
- `design/Rules.dc.html` and `design/Main.dc.html`: in full, with the script. Screen lines: 829-893. Script lines: 1069-1076, 1309-1318, 1448-1458
- `design/inventory/Rules.json` (a wrapper) and `design/inventory/Main.json`, section `RULES`
- `tasks/02-frame.md`: "Files for parallel work", "Tests that need two screens"

## Steps, in order

1. Add this task file in the first commit. Get Moe's answers to "Stop and ask" before step 2.
2. Write the Rules and limits state model in `packages/statecharts/rules` with the `statechart` skill, before its code. States: Rule on/off and the three sliders. Rules are in `docs/PLAN.md` "State models". Name the code files in its `# model:` comment. TLC must report no broken rule. Add `.agents/skills/tensquads-verify/models/rules.md`.
3. Fill the slots. `rule-commands.ts`, `commands/rules.ts` and `plugins/policy-rules.ts` give `setRuleOn`, `addRule` and `setLimit`. `addRule` follows `Main.dc.html:1453-1457`: a blank action does nothing, the first letter of the trigger becomes lower case, the new rule is on, it goes last, and only the action field clears. `setLimit` writes the `state_entries` row with the same JSON format as the seed. `listRules` keeps the design order through `sort_order`. Add the limit definitions at `Main.dc.html:1313-1315` to `rule-commands.ts`.
4. Build `apps/web/src/server/rules.ts` and `apps/web/src/screens/rules/`. Replace `apps/web/src/routes/_workspace/rules.tsx`. The loader reads the rules and the three `policy.*` keys. The form values live in the provider, so they stay when the user leaves the page (`Main.dc.html:1076`).
5. Build the screen from `Main.dc.html:829-893`. The triggers and the approval options are at `Main.dc.html:1449-1451`. The agent options come from the agent list. Keep `accent-color: #181818` on the sliders.
6. Add `e2e/rules.spec.ts` with the behaviour tests below. Add the screenshot comparison at 1440 px and 390 px, and the inventory comparison with `mainSection("RULES")`.
7. Report these differences in the pull request: the form label says "Agent", and the design elsewhere says "Squads". The rules run no action in version 1, as in the design.
8. Add a test from `tasks/02-frame.md` "Tests that need two screens" if the other branch is on `main`. Until then, a unit test proves that `setLimit` changes the value `bus.readStore` returns.
9. Rebase on `main` last. Then append one line to `progress.md` with the commit script.

### Files

This branch adds its screen folder, `apps/web/src/server/rules.ts`, `e2e/rules.spec.ts` with snapshots, `packages/statecharts/rules/**`, and `.agents/skills/tensquads-verify/models/rules.md`. It changes `apps/web/src/routes/_workspace/rules.tsx`, `packages/domain/src/policy/rule-commands.ts`, `packages/adapters/src/neon/commands/rules.ts`, `packages/kernel/src/plugins/policy-rules.ts`, and, only for item 4 below, `packages/adapters/src/neon/create-workspace.ts` and its test. Change no other file.

### State model

This task owns Rules and limits.

### Behaviour tests

Each row is one test in `e2e/rules.spec.ts`.

| Behaviour line | Test title |
| --- | --- |
| `docs/BRIEF.md` Screens: Rules list with switches, new-rule form, three limit sliders | `rules shows five rules, the form and three sliders` |
| `docs/BRIEF.md` Rules: Rule switches toggle on | `a rule switch changes only that rule` |
| `docs/BRIEF.md` Rules: The new-rule form has trigger, agent and approval selects | `the form adds a rule with the chosen trigger, agent, action and approval` |
| `docs/BRIEF.md` Rules: The three sliders write to policy.refund_auto_limit, policy.daily_ad_cap, policy.reorder_limit | `each slider writes its policy key and shows the value` |
| `Main.dc.html:1455` blank action | `a blank action adds no rule` |
| `Main.dc.html:1456` form reset | `after a new rule only the action field clears` |
| `Main.dc.html:1313-1315` slider range | `each slider has the design minimum, maximum and step` |

The second half of the slider line, "the traffic state table reflects it", is `e2e/cross-limit-traffic.spec.ts`.

## Done when

- [ ] Every item under "What done means" in `AGENTS.md` passes for `/rules`, with evidence: both 1440 px images, tests, inventory, keyboard, 390 px
- [ ] Each behaviour row above is one passing test
- [ ] With the seed loaded the sliders show $50, $200 and $500
- [ ] A rule switch and a slider persist after a page reload
- [ ] A chat message after a limit change carries the new limit in its Task payload (`Main.dc.html:1151`)
- [ ] `packages/statecharts/rules/chart.mmd` exists and TLC reports no broken rule
- [ ] The seed tests still pass with the nine numbers
- [ ] `node scripts/design-check.mjs` returns 0
- [ ] `make verify` returns 0 on the branch and in CI

## Stop and ask

Ask Moe, in a numbered list. Items 13 and 14 in `tasks/02-frame.md` apply to this screen.

1. **A limit change and the bus.** The design writes the state with no event (`Main.dc.html:1318`). The Traffic text says every write travels on the bus, and decision 16 makes the bus the only writer. Recommended: follow the design in version 1. No event, a direct state write. The Cloudflare bus in phase 4 applies decision 16.
2. **Slider write rate.** A drag fires many changes, and a late request can overwrite a newer value. Recommended: the screen updates at once. One write runs at a time for each key, and the last value always goes out.
3. **New account.** It has no rules, and the form default `orders` can be an agent it does not have. Recommended: show the rules card with no rows, and default to the first agent.
4. **Default ad cap.** Task 01 gives a new account `policy.daily_ad_cap` 50. The design seed has 200 (`Main.dc.html:1066`), and no design file gives a default. Recommended: use 200, the design value, and update the create test.

Also stop and ask for any state the design does not show that this file does not cover.

## Orchestrator decisions

Moe delegated these answers. Each item uses the recommended answer.

1. A limit change writes state directly. It writes no event in version 1. The Cloudflare bus in phase 4 applies decision 16.
2. The slider updates at once. One write runs at a time for each key. The last value always goes out.
3. A new account shows the rules card with no rows. The form defaults to the first agent.
4. The default ad cap is 200, the design seed. `packages/adapters/src/neon/create-workspace.ts` and its test on main already store and expect 200. This task does not edit those files.

## Do not

- Do not make a rule start a task. The rules in the design change no other state.
- Do not add a rule delete or edit control. The design has none.
- Do not change `decide.ts`, the frame, the indexes, the schema or `e2e/support.ts`.
- Do not build the Traffic screen. Read its state only through the repository.
- Do not replace the stored `success` value or add the metrics table. It stays out of phase 2. No file in this task replaces it.
- Do not add a text string, colour, font, radius or shadow beyond this file and the design.
- Do not change anything under `design/`.
- Do not edit `docs/PLAN.md` or `docs/BRIEF.md`. Report each difference in the pull request.
