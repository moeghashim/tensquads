# Task 02 — Agents list, screen 5 (phase 2)

Branch: `02-agents`. One pull request. One builder agent. Starts only when 02-frame is merged. Runs in parallel with the other screen tasks. Read `AGENTS.md` first and send the receipt.

## Goal

`/agents` shows one card per agent, with status, mission line, contribution, host, skill chips, tasks, success and autonomy. A card opens that agent's dashboard. It matches the design at 1440 px and 390 px. `make verify` returns 0.

## Read

- `docs/PLAN.md`: Decisions (all), State models (Agent on/off), Phases (phase 2)
- `docs/BRIEF.md`: Screens and routes (Agents), Data model (Agent, Skill), Behaviour (Agents and agent dashboard), Definition of done
- `design/Agents.dc.html` and `design/Main.dc.html`: in full, with the script. Screen lines: 543-586. Script lines: 1209-1222, 1426
- `design/inventory/Agents.json` (a wrapper) and `design/inventory/Main.json`, section `AGENTS LIST`
- `tasks/02-frame.md`: "Files for parallel work"

## Steps, in order

1. Add this task file in the first commit. Get Moe's answers to "Stop and ask" before step 2.
2. Build `apps/web/src/screens/agents/`. Replace `apps/web/src/routes/_workspace/agents.index.tsx`. Read the agents from the frame loader. This screen makes no write and no new server function.
3. Build the screen from `Main.dc.html:543-586`. Use `agent-view.ts` from the frame for `statusLabel`, `statusStyle`, `missionLine`, `missionColor`, `contribution`, `contributionLabel`, `barColor` and `skillChips`. `skillChips` is the first three skills that are on (`Main.dc.html:1221`).
4. Add `e2e/agents.spec.ts` with the behaviour tests below. Add the screenshot comparison at 1440 px and 390 px, and the inventory comparison with `mainSection("AGENTS LIST")`.
5. Report these differences in the pull request: the page title is "Agents" and the heading is "Squads". The brief says "Agents", the design says "Squads". The design sentence says "sandbox server" (`Main.dc.html:548`).
6. Rebase on `main` last. Then append one line to `progress.md` with the commit script.

### Files

This branch adds its screen folder, `e2e/agents.spec.ts` with snapshots. It changes `apps/web/src/routes/_workspace/agents.index.tsx`. Change no other file.

### State model

This task owns no model. The list has no switch in the design. It only reads `on`. Agent on/off is in the plan under screens 5 and 6. 02-agent-detail owns it, because its code is there.

### Behaviour tests

Each row is one test in `e2e/agents.spec.ts`.

| Behaviour line | Test title |
| --- | --- |
| `docs/BRIEF.md` Screens: List of the account's agents with status, autonomy, tasks, skill chips | `the list shows five cards with status, autonomy, tasks and chips` |
| `docs/BRIEF.md` Screens: Click opens the agent dashboard | `a card opens that agent's dashboard` |
| `Main.dc.html:1219-1220` status | `a running agent shows Running and a paused agent shows Paused` |
| `Main.dc.html:1210-1214` mission | `an agent with no mission shows the pending line and Pending` |
| `Main.dc.html:1214` bar colour | `the bar colour follows the contribution value` |
| `Main.dc.html:1221` chips | `a card shows at most three skills that are on` |

## Done when

- [ ] Every item under "What done means" in `AGENTS.md` passes for `/agents`, with evidence: both 1440 px images, tests, inventory, keyboard, 390 px
- [ ] Each behaviour row above is one passing test
- [ ] With the seed loaded the cards show tasks 142, 96, 38, 24 and 31, which sum to 331
- [ ] The seed tests still pass with the nine numbers
- [ ] `node scripts/design-check.mjs` returns 0
- [ ] `make verify` returns 0 on the branch and in CI

## Stop and ask

Ask Moe, in a numbered list. Items 13 and 14 in `tasks/02-frame.md` apply to this screen.

1. **Pending line with no proposal.** A new agent has no mission and no proposal. The design line says "Master has proposed one; approve it in the inbox.", which is then false. Recommended: keep the line word for word in phase 2. Moe decides later if sign-up must make a proposal.
2. **Stored percentages.** `success` and `contribution` are stored, and `AGENTS.md` says never to store a percentage. The plan computes `success` from passed checks, and those start with the agent loop. Recommended: keep both as seeded values. They stay out of phase 2.

Also stop and ask for any state the design does not show that this file does not cover.

## Do not

- Do not add a switch to the list. The design has none.
- Do not change `agent-view.ts`, the frame, the indexes, the schema or `e2e/support.ts`.
- Do not build the agent dashboard. Until that task merges, a card opens a blank page.
- Do not replace the stored `success` value or add the metrics table. It stays out of phase 2. No file in this task replaces it.
- Do not add a text string, colour, font, radius or shadow beyond this file and the design.
- Do not change anything under `design/`.
- Do not edit `docs/PLAN.md` or `docs/BRIEF.md`. Report each difference in the pull request.
