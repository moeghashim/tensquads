# Task 02 — Agent dashboard, screen 6 (phase 2)

Branch: `02-agent-detail`. One pull request. One builder agent. Starts only when 02-frame is merged. Runs in parallel with the other screen tasks. Read `AGENTS.md` first and send the receipt.

## Goal

`/agents/$id` shows one agent: the on/off switch, the mission and targets, the KPIs, the skills with gates and switches, the autonomy picker, the sandbox details, and that agent's messages. The switches update at once. Off shows CPU 0% and uptime "Paused", through the `MachineProvider` interface. It matches the design at 1440 px and 390 px. `make verify` returns 0.

## Read

- `docs/PLAN.md`: Decisions (all), Architecture ("Some rules cross domain areas", "The boundary layer"), Service setup (the field table), State models (Agent on/off, Agent loop), Phases (phase 2)
- `docs/BRIEF.md`: Screens and routes (Agent dashboard), Data model (Agent, Skill, Bus event), Behaviour (Agents and agent dashboard), Definition of done
- `design/AgentDetail.dc.html` and `design/Main.dc.html`: in full, with the script. Screen lines: 588-717. Script lines: 1186-1190, 1203-1204, 1255-1279
- `design/inventory/AgentDetail.json` (a wrapper) and `design/inventory/Main.json`, section `AGENT DETAIL`
- `tasks/02-frame.md`: "Files for parallel work", "Tests that need two screens"
- `packages/adapters/src/test-machine.ts`, `packages/kernel/src/ports.ts`, `packages/domain/src/policy/decide.ts` (read only)

## Steps, in order

1. Add this task file in the first commit. Get Moe's answers to "Stop and ask" before step 2.
2. Write the Agent on/off state model in `packages/statecharts/agent-onoff` with the `statechart` skill, before its code. States: Off, Starting, On, Stopping, Paused. Rules are in `docs/PLAN.md` "State models". Name the code files in its `# model:` comment. TLC must report no broken rule. Add `.agents/skills/tensquads-verify/models/agent-onoff.md`.
3. Add `start(agentId)` and `stop(agentId)` to `MachineProvider` in `packages/kernel/src/ports.ts`. The plan requires the core to use this interface, and the port has no such method. The test adapter keeps the on value for each machine. `cpu` and `uptime` already follow `Main.dc.html:1267`.
4. Fill the slots. `agent-commands.ts`, `commands/agents.ts` and `plugins/squads.ts` give `setAgentOn`, `setSkillOn`, `setAutonomy` and `askRevise`. Each runs in one transaction. `setAgentOn` calls the `MachineProvider` first. `askRevise` uses the function in `decide.ts` and takes an id from `Main.dc.html:1189`. A change of autonomy does not change on/off.
5. Build `apps/web/src/server/agent-detail.ts` and `apps/web/src/screens/agent-detail/`. Replace `apps/web/src/routes/_workspace/agents.$id.tsx`. The loader reads the agent, its skills, its machine values through the `MachineProvider`, and its events, newest first (`Main.dc.html:1277`).
6. Build the screen from `Main.dc.html:588-717`, with the values at `Main.dc.html:1258-1278`. The nav item "Squads" stays selected. "All squads" opens `/agents`. A message click calls `useInspect`. "Ask Master to revise" writes, then opens `/overview`. When a proposal exists for that agent, it only opens `/overview` (`Main.dc.html:1187`). Call `useRefresh()` after each write, so the sidebar dot and the dock line show the new value.
7. Add `e2e/agent-detail.spec.ts` with the behaviour tests below. Add the screenshot comparison at 1440 px and 390 px for `/agents/support`, at the 1300 px artboard height, and the inventory comparison with `mainSection("AGENT DETAIL")`.
8. Report this difference in the pull request: the design says "Squad running", "Sandbox" and "All squads", the brief says agent and machine.
9. Add a test from `tasks/02-frame.md` "Tests that need two screens" if the other branch is on `main`.
10. Rebase on `main` last. Then append one line to `progress.md` with the commit script.

### Files

This branch adds its screen folder, `apps/web/src/server/agent-detail.ts`, `e2e/agent-detail.spec.ts` with snapshots, `packages/statecharts/agent-onoff/**`, and `.agents/skills/tensquads-verify/models/agent-onoff.md`. It changes `apps/web/src/routes/_workspace/agents.$id.tsx`, `packages/domain/src/squads/agent-commands.ts`, `packages/adapters/src/neon/commands/agents.ts`, `packages/kernel/src/plugins/squads.ts`, `packages/kernel/src/ports.ts`, `packages/adapters/src/test-machine.ts`. Change no other file. `decide.ts` is read only here.

### State model

This task owns Agent on/off. The Agent loop model stays out of phase 2 (item 2 below).

### Behaviour tests

Each row is one test in `e2e/agent-detail.spec.ts`.

| Behaviour line | Test title |
| --- | --- |
| `docs/BRIEF.md` Screens: on/off switch, KPIs, machine details, egress and secrets, skills with per-skill gate and switch, autonomy picker, bus events | `the dashboard shows every section for one agent` |
| `docs/BRIEF.md` Agent dashboard: Agent on/off switch updates state immediately. Off shows CPU 0% and uptime "Paused" | `the switch turns an agent off and shows 0 percent and Paused` |
| `docs/BRIEF.md` Agent dashboard: per-skill on/off switches update state immediately | `a skill switch changes only that skill` |
| `docs/BRIEF.md` Agent dashboard: the autonomy picker updates state immediately | `the autonomy picker changes autonomy and not on or off` |
| `Main.dc.html:1267` restart | `turning on a stopped agent shows Just started` |
| `Main.dc.html:1259-1262`, `:639` no mission | `an agent with no mission shows the pending text and no targets` |
| `Main.dc.html:1187-1189` Ask to revise | `ask to revise adds one proposal and opens overview, and a repeat adds none` |
| `Main.dc.html:592` All squads | `all squads opens the list and the nav stays on Squads` |

## Done when

- [ ] Every item under "What done means" in `AGENTS.md` passes for `/agents/$id`, with evidence: both 1440 px images, tests, inventory, keyboard, 390 px
- [ ] Each behaviour row above is one passing test
- [ ] A test proves that the core calls `MachineProvider.stop` and `start`. The screen does not set CPU or uptime itself
- [ ] A switch change persists after a page reload, and the sidebar dot follows it
- [ ] `packages/statecharts/agent-onoff/chart.mmd` exists and TLC reports no broken rule
- [ ] The seed tests still pass with the nine numbers
- [ ] `node scripts/design-check.mjs` returns 0
- [ ] `make verify` returns 0 on the branch and in CI

## Stop and ask

Ask Moe, in a numbered list. Items 13, 14 and 15 in `tasks/02-frame.md` apply to this screen.

1. **Unknown agent id.** The design has routes by state, not by URL. With no selected agent it shows the list (`Main.dc.html:1426`). Recommended: `/agents/<unknown>` goes to `/agents`.
2. **Agent loop model.** The plan lists it under screens 6 and 7 and says each screen adds its model. Version 1 has no agent loop code in phase 2. `tasks/05-proof-of-concept.md` lists it in "Done when". Recommended: it stays out of phase 2.
3. **Five states, two labels.** The model has Off, Starting, On, Stopping and Paused. The design shows only Running and Paused, and says the switch updates at once. Recommended: the test adapter passes Starting and Stopping in one step. The screen shows Running for On and Paused for the rest.
4. **"A skill cannot run when its agent is Off."** The design's `nextEvent()` runs Inventory's skills while Inventory is off (`Main.dc.html:985`, `:1101-1102`). Recommended: the rule covers `send()`, which the paused answer already blocks. `nextEvent()` is a replay and is out of the rule. 02-traffic uses the same reading.
5. **All skills off.** `send()` falls back to the first skill (`Main.dc.html:1150`), but the screen says the master can only ask for a skill that is on. Recommended: follow the code, and report the difference.
6. **`accounts.online`.** This stored count shows on the admin table. It does not follow the switch, and the design does not link them. Recommended: leave it. Phase 3 decides when it computes the totals.
7. **New account dashboard.** There are no machine values, KPIs, skills, targets or events, and no autonomy change has an effect. Recommended: item 14 in `tasks/02-frame.md`, with the "Pending approval" mission text unchanged.

Also stop and ask for any state the design does not show that this file does not cover.

## Do not

- Do not change `decide.ts`. 02-overview owns it.
- Do not add a status word such as "Starting" to the screen. The design shows Running and Paused.
- Do not change the frame, the indexes, the schema or `e2e/support.ts`.
- Do not build the boat.dev adapter. That is phase 4.
- Do not replace the stored `success` value, the stored `contribution` value, or add the metrics table. They stay out of phase 2. No file in this task replaces them.
- Do not add a text string, colour, font, radius or shadow beyond this file and the design.
- Do not change anything under `design/`.
- Do not edit `docs/PLAN.md` or `docs/BRIEF.md`. Report each difference in the pull request.
