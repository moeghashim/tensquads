# Chat and dock

One draft is shared by the page and the dock. A send with a matching agent that is on writes the user message, the master message, and a Task, then waits. The reply writes the agent message and a Result, adds one task, and sets `last` to the result text. The Result names its writes and does not change the store. No agent and a paused agent answer at once and write no event. An empty send changes nothing. A second send within 30 seconds of a Task changes nothing. The adapter stores an absolute event instant and compares it with the same clock. After 30 seconds, the Task stays but no longer blocks a send. Its completion is ignored. A completion also carries its Task id, so an old completion cannot finish a later Task. An agent with no skill on records the skill as `-`. A reload during Working keeps the Task, writes no Result, clears both drafts, and closes the dock. On Chat or admin the dock stays hidden and the saved choice becomes closed, so leaving that page shows the dock closed. Chat and admin hide the dock and restore the open or closed choice. A draft can be typed during Idle, Working, and Replied. A begin, a finish, and the refresh after them each wait at most 30 seconds. A begin that does not settle still refreshes, then clears the guard. A finish that does not settle returns to Idle and keeps that draft, then refreshes. A refresh that does not settle clears the guard. Those three waits are not in the fairness set.

The chart hides Stay, Type, SendEmpty, SecondSend, StartBegin, BeginTimeout, Refresh, RefreshTimeout, and the page moves. Stay changes nothing. Timeout releases a reload after the 30 second window. The begin, finish, and refresh timeouts are not in that fairness set. NextMessage permits another send after a reply. SendAgain requires that a send can be accepted again, with fair reply, reload, and timeout steps.

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

A model failure is a path of Type, an empty send, a begin, no agent, a paused agent, a send, a send with no skill, the reply, a reload, a second send, leaving Chat, a finish that does not settle, or a refresh that does not settle. Replay that path in `beginSend` and `finishSend`. Replay the dock wait, the dock choice, and the reload in `WorkspaceProvider`. If the code can do the path, the code is wrong. If the code cannot do a step, the model is wrong. Say which.

## Keep the check in step

| Check | Covers | Result |
| --- | --- | --- |
| `send.test.ts` | ids, clock, the 30 second window, and a dash skill | exit 0 |
| `/statechart` on `ChatDock.tla` | one draft, one send, a reload that closes the dock, the dock choice, and the three 30 second waits | TLC reached 336 states and 1948 steps |

The checks name no commit, so a later head does not make this note stale. They keep the 30 second pending window, the client bounds on begin, finish, and refresh, and the dock choice. TLC named no broken rule. The rules are TypeOK, MessageOrder, SendShape, DockHidden, OneDraft, WritesDoNotChangeStore, SkillDash, BoundedWait, NoDeadlock, and SendAgain. The chart draws 3 states and 5 arrows. The view hides 1516 steps.

Update this note when the model or the send rules change. Record the TLC counts from that run. Do not name a commit. An intended change updates `conversation.ts`, `send.test.ts`, and `ChatDock.tla` together.

## Bounds

The model tracks one current message and a retained abandoned Task. NextMessage resets the current message counters after a reply. Timeout moves an abandoned Task into the retained history and clears the current message counters. Repeated sends use this finite abstraction. Tasks for the current message start at 0 and become 1. The code test starts Marketing at 38 tasks and ends at 39. The clock, the message ids, and the event ids are in the code test. The model does not count unbounded history, the six-message dock, or the badge. The browser check covers reload during Working, a later send after the window, a held begin, a held finish, a held refresh, a lost finish response, a failed refresh, and an older loader during a send.

TLC reached 336 states and 1948 steps with no broken rule, including SendAgain and BoundedWait. The generated chart has 3 states and 5 arrows and hides 1516 steps. Timeout stays inside Idle in the chart. The finish timeout and the reload share one arrow from Working to Idle. Begin, finish, and refresh are bounded waits in the model and are hidden on that chart. A reload closes the dock.
