# Chat and dock

One draft is shared by the page and the dock. A send with a matching agent that is on writes the user message, the master message, and a Task, then waits. The reply writes the agent message and a Result, adds one task, and sets `last` to the result text. The Result names its writes and does not change the store. No agent and a paused agent answer at once and write no event. An empty send changes nothing. A second send within 30 seconds of a Task changes nothing. The adapter stores an absolute event instant and compares it with the same clock. After 30 seconds, the Task stays but no longer blocks a send. Its completion is ignored. A completion also carries its Task id, so an old completion cannot finish a later Task. An agent with no skill on records the skill as `-`. A reload during Working keeps the Task and writes no Result. Chat and admin hide the dock and restore the open or closed choice. A draft can be typed during Idle, Working, and Replied. A finish request that does not settle returns to Idle after 30 seconds and keeps that draft. A reload clears both drafts.

The chart hides Stay, Type, SendEmpty, SecondSend, and the page moves. Stay changes nothing. Timeout releases a reload after the 30 second window. The finish timeout is not in that fairness set. It returns to Idle and keeps the draft. NextMessage permits another send after a reply. SendAgain requires that a send can be accepted again, with fair reply, reload, and timeout steps.

## When this applies

Run this check when a change touches any of these:

- `packages/adapters/src/neon/commands/conversation.ts`
- `packages/adapters/src/pending-window.ts`
- `packages/kernel/src/plugins/conversation.ts`
- `packages/kernel/src/plugins/bus.ts`
- `scripts/test/workspace-send.test.mjs`
- `apps/web/src/workspace/provider.tsx`
- `packages/adapters/test/send.test.ts`
- `packages/statecharts/chat-dock/ChatDock.tla`
- `packages/statecharts/chat-dock/ChatDock.cfg`
- `packages/statecharts/chat-dock/view.mjs`
- `packages/statecharts/chat-dock/chart.mmd`

A rename or a move of one of these files is still a covered change.

## Run

Run the code check from the repository root:

```sh
node --experimental-strip-types --test packages/adapters/test/send.test.ts scripts/test/workspace-send.test.mjs
```

Exit 0 means the send still matches the rules above. A failure is a break in the code. Do not change the test to hide it.

Then read the model with `/statechart`. The spec is `packages/statecharts/chat-dock/ChatDock.tla`. The config is `packages/statecharts/chat-dock/ChatDock.cfg`. The view is `packages/statecharts/chat-dock/view.mjs`. The chart is `packages/statecharts/chat-dock/chart.mmd`. `/statechart` is the only way to read the TLC result. Do not copy its command into this skill or into a script.

Exit 0 and a report that names no broken rule means the model holds. A broken rule is a finding. Do not weaken an invariant so that the run passes.

TLC does not read `conversation.ts`. A pass of the model does not prove the TypeScript. Run both checks.

## What a failure means

A model failure is a path of Type, an empty send, no agent, a paused agent, a send, a send with no skill, the reply, a reload, a second send, leaving Chat, or a finish that does not settle. Replay that path in `beginSend` and `finishSend`. Replay the dock wait, the dock choice, and the reload in `WorkspaceProvider`. If the code can do the path, the code is wrong. If the code cannot do a step, the model is wrong. Say which.

## Keep the check in step

| Check | Covers | Sync commit |
| --- | --- | --- |
| `send.test.ts` | ids, clock, the 30 second window, and a dash skill | `6e21c75488bd2c40ab04047b5b38d743dec95f98` |
| `/statechart` on `ChatDock.tla` | one draft, one send, a reload, the dock choice, and a later send | `6e21c75488bd2c40ab04047b5b38d743dec95f98` |

Both checks passed on `6e21c75488bd2c40ab04047b5b38d743dec95f98`. That tree keeps the 30 second pending window, the client abort, and the dock choice. `send.test.ts` exited 0. TLC exited 0, reached 192 states and 1024 steps, and named no broken rule. The rules are TypeOK, MessageOrder, SendShape, DockHidden, OneDraft, WritesDoNotChangeStore, SkillDash, NoDeadlock, and SendAgain. The chart draws 3 states and 5 arrows. The view hides 736 steps.

Move a sync commit forward only after both checks pass and you confirm that the model and the tests still describe the code at the new commit. An intended change updates `conversation.ts`, `send.test.ts`, and `ChatDock.tla` together.

## Bounds

The model tracks one current message and a retained abandoned Task. NextMessage resets the current message counters after a reply. Timeout moves an abandoned Task into the retained history and clears the current message counters. Repeated sends use this finite abstraction. Tasks for the current message start at 0 and become 1. The code test starts Marketing at 38 tasks and ends at 39. The clock, the message ids, and the event ids are in the code test. The model does not count unbounded history, the six-message dock, or the badge. The browser check covers reload during Working, a later send after the window, a held finish, a lost finish response, a failed refresh, and an older loader during a send.

The review worktree run passed the send, browser recovery, and migration checks. TLC reached 192 states and 1024 steps with no broken rule, including SendAgain. The generated chart has 3 states and 5 arrows and hides 736 steps. Timeout stays inside Idle in the chart. The finish timeout and the reload share one arrow from Working to Idle.
