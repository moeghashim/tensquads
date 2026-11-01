# Chat and dock

One draft is shared by the page and the dock. A send with a matching agent that is on writes the user message, the master message, and a Task, then waits. The reply writes the agent message and a Result, adds one task, and sets `last` to the result text. The Result names its writes and does not change the store. No agent and a paused agent answer at once and write no event. An empty send changes nothing. A second send while a Task is still open changes nothing. An agent with no skill on records the skill as `-`. A reload during Working keeps the Task and writes no Result. The dock is hidden on the chat page.

The chart hides Stay, Type, SendEmpty, SecondSend, and the page moves. Stay changes nothing. It exists so a finished reply and a reload are not a deadlock.

## When this applies

Run this check when a change touches any of these:

- `packages/adapters/src/neon/commands/conversation.ts`
- `packages/kernel/src/plugins/conversation.ts`
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
node --experimental-strip-types --test packages/adapters/test/send.test.ts
```

Exit 0 means the send still matches the rules above. A failure is a break in the code. Do not change the test to hide it.

Then read the model with `/statechart`. The spec is `packages/statecharts/chat-dock/ChatDock.tla`. The config is `packages/statecharts/chat-dock/ChatDock.cfg`. The view is `packages/statecharts/chat-dock/view.mjs`. The chart is `packages/statecharts/chat-dock/chart.mmd`. `/statechart` is the only way to read the TLC result. Do not copy its command into this skill or into a script.

Exit 0 and a report that names no broken rule means the model holds. A broken rule is a finding. Do not weaken an invariant so that the run passes.

TLC does not read `conversation.ts`. A pass of the model does not prove the TypeScript. Run both checks.

## What a failure means

A model failure is a path of Type, an empty send, no agent, a paused agent, a send, a send with no skill, the reply, a reload, or a second send. Replay that path in `beginSend` and `finishSend`. Replay the dock wait and the reload in `WorkspaceProvider`. If the code can do the path, the code is wrong. If the code cannot do a step, the model is wrong. Say which.

## Keep the check in step

| Check | Covers | Sync commit |
| --- | --- | --- |
| `send.test.ts` | ids, clock, no event, a pending task, and a dash skill | `06ed4c7af446f86505fb095380e6a8587316e25a` |
| `/statechart` on `ChatDock.tla` | one draft, one send, and a reload that keeps the Task | `06ed4c7af446f86505fb095380e6a8587316e25a` |

Both checks passed on `06ed4c7af446f86505fb095380e6a8587316e25a`. That tree keeps the dock send and the dock wait. `send.test.ts` exited 0. TLC exited 0, reached 40 states and 172 steps, and named no broken rule. The rules are TypeOK, MessageOrder, SendShape, DockHidden, OneDraft, WritesDoNotChangeStore, SkillDash, and NoDeadlock. The chart draws 3 states and 4 arrows. The view hides 140 steps.

Move a sync commit forward only after both checks pass and you confirm that the model and the tests still describe the code at the new commit. An intended change updates `conversation.ts`, `send.test.ts`, and `ChatDock.tla` together.

## Bounds

The model is one message. Tasks start at 0 and become 1. The code test starts Marketing at 38 tasks and ends at 39. The clock, the message ids, and the event ids are in the code test. The model does not cover a second message after the reply, the six-message dock, or the badge.
