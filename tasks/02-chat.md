# Task 02 — Chat with the master, screen 4 (phase 2)

Branch: `02-chat`. One pull request. One builder agent. Starts only when 02-frame is merged. Runs in parallel with the other screen tasks. Read `AGENTS.md` first and send the receipt.

## Goal

`/chat` replaces the blank page from task 01. It shows the thread, the working line, four suggestion chips, the input and the hand-offs panel. It uses the send path, the thread and the draft from 02-frame, so the page and the dock show one conversation. It matches the design at 1440 px and 390 px. `make verify` returns 0.

## Orchestrator decisions

Moe delegated these build questions. Each item uses the recommended answer. These decisions are final for this screen.

1. An empty thread shows the heading, the chips, and the input. Add no text.
2. Empty hand-offs show the heading and the sentence, with no rows.
3. Add no page scroll.
4. Frame item 10 stays. `send()` follows the design order. This screen does not change `send()`.
5. Frame item 11 stays. The chat input focus offset stays 6 px.
6. Frame item 13 stays. The loader runs on the server. A write shows at once. A failed write reads the data again and shows no new text. A failed read uses the default router error page.
7. Frame item 15 stays. An agent with no skills uses the skill value `-`. This screen does not change that path.
8. Frame item 16 stays. A Result lists writes and has no set. This screen changes no stored value.
9. Frame item 17 stays. A reload during Working leaves the Task and writes no Result. This screen does not change that path.

The page adds no state and no action. The Chat and dock model stays the 02-frame model.

## Read

- `docs/PLAN.md`: Decisions (all), Architecture (Conversation, "How agents send messages"), State models (Chat and dock), Phases (phase 2)
- `docs/BRIEF.md`: Screens and routes (Chat with the master), Data model (Chat message, Bus event), Behaviour (Workspace, all pages; Chat), Definition of done
- `design/Chat.dc.html` and `design/Main.dc.html`: in full, with the script. Screen lines: 495-541. Script lines: 1115-1163, 1246-1253, 1431, 1441
- `design/inventory/Chat.json` (a wrapper) and `design/inventory/Main.json`, section `CHAT`
- `tasks/02-frame.md`: "Files for parallel work", "Tests that need two screens", and the send path steps
- `packages/statecharts/chat-dock/`, `.agents/skills/tensquads-verify/models/chat-dock.md`

## Steps, in order

1. Add this task file in the first commit. Get Moe's answers to "Stop and ask" before step 2.
2. Build `apps/web/src/server/chat.ts` and `apps/web/src/screens/chat/`. Replace `apps/web/src/routes/_workspace/chat.tsx`. The loader reads the thread and the last six bus events.
3. Build the screen from `Main.dc.html:495-541`. The bubble styles are at `Main.dc.html:1246-1252`. `draft`, `thinking` and the send call come from `WorkspaceProvider`. Do not write a second send path.
4. All four suggestions send at once (`Main.dc.html:1253`). The hand-offs panel shows `chatBus`: the last six events of the whole bus, newest first (`Main.dc.html:1441`). A hand-off click calls `useInspect` from the frame, which opens `/traffic`.
5. Run the Chat and dock model. It must still report no broken rule. The page adds no state or action, so the model needs no change. If this branch must change `send()`, stop and ask.
6. Add `e2e/chat.spec.ts` with the behaviour tests below. The seed has Inventory off, so the five-route test sets it on through the `workspaceTest` data, not through the dashboard. Add the screenshot comparison at 1440 px and 390 px, and the inventory comparison with `mainSection("CHAT")`.
7. Report these differences in the pull request: the brief says hand-offs "from this chat", the design shows the last six events of the whole bus. The scripted replies say "agent" and "Agents" (`Main.dc.html:1136`, `:1140`, `:1153`), and the nav says "Squads".
8. Add a test from `tasks/02-frame.md` "Tests that need two screens" if the other branch is on `main`.
9. Rebase on `main` last. Then append one line to `progress.md` with the commit script.

### Files

This branch adds its screen folder, `apps/web/src/server/chat.ts`, `e2e/chat.spec.ts` with snapshots. It changes `apps/web/src/routes/_workspace/chat.tsx`. Change no other file.

### State model

This task owns no new model. It uses Chat and dock, which 02-frame owns, and must keep it green. The reason is that the dock ships first and shares one thread and one draft with this page.

### Behaviour tests

Each row is one test in `e2e/chat.spec.ts`.

| Behaviour line | Test title |
| --- | --- |
| `docs/BRIEF.md` Screens: message thread, suggestion chips, input, hand-offs side panel | `the chat page shows the thread, four chips, the input and six hand-offs` |
| `docs/BRIEF.md` Chat: Sending a message appends the user bubble, shows "<Agent> agent is working on it…", then a master reply and a bus event, following the scripted replies in send() | `a message shows the bubble, the working line, then the agent reply` |
| `docs/BRIEF.md` Chat: Enter sends | `enter sends the draft and clears the input` |
| `docs/BRIEF.md` Workspace: It shares the thread and draft with the chat page | `the dock and the chat page share one thread and one draft` |
| `docs/BRIEF.md` Workspace: Hidden on the chat page | `the dock is hidden on the chat page and comes back on the next page` |
| `Main.dc.html:1253` chips | `a suggestion chip sends its text at once` |
| `Main.dc.html:1115-1126` routes | `each of the five routes gets its scripted reply` |
| `Main.dc.html:1441` hand-offs | `a new message adds to the top of the hand-offs` |

## Done when

- [ ] Every item under "What done means" in `AGENTS.md` passes for `/chat`, with evidence: both 1440 px images, tests, inventory, keyboard, 390 px
- [ ] Each behaviour row above is one passing test
- [ ] A message sent on the page shows in the dock on the next page. A draft typed in the dock shows in the page input
- [ ] After one routed message, the Tasks done sum is 332 in the data
- [ ] `packages/statecharts/chat-dock/chart.mmd` still matches and TLC reports no broken rule
- [ ] The seed tests still pass with the nine numbers
- [ ] `node scripts/design-check.mjs` returns 0
- [ ] `make verify` returns 0 on the branch and in CI

## Stop and ask

Ask Moe, in a numbered list. Items 10, 11, 13, 15, 16 and 17 in `tasks/02-frame.md` apply to this screen.

1. **Empty thread.** A new account has no messages. The design shows no empty thread. Recommended: show the heading, the chips and the input, with no added text.
2. **Empty hand-offs.** A new account has no events. Recommended: show the heading and the sentence, with no rows.
3. **Page scroll.** The design has no scroll logic for the thread. A long thread can push the input below the fold. Recommended: add none, as in the design.

Also stop and ask for any state the design does not show that this file does not cover.

## Do not

- Do not change `route()`, `send()`, the reply strings or the provider. 02-frame owns them.
- Do not change the frame, the indexes, the schema or `e2e/support.ts`.
- Do not add a model call. Version 1 has no AI model (decision 4).
- Do not replace the stored `success` value or add the metrics table. It stays out of phase 2. No file in this task replaces it.
- Do not add a text string, colour, font, radius or shadow beyond this file and the design.
- Do not change anything under `design/`.
- Do not edit `docs/PLAN.md` or `docs/BRIEF.md`. Report each difference in the pull request.
