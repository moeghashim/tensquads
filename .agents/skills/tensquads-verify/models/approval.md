# Approval inbox

An approve of a spend adds one task and sets `last` to the title plus " (approved)". A decline of a spend changes no agent field. An approve of a spend writes one bus event and one Mandate. A decline of a spend writes one bus event and no Mandate. An approve of a mission sets the mission, sets contribution to 0, and adds no task. A decline of a mission sets the proposal to Revising and changes no agent field. A mission decision writes no bus event and no Mandate. `askRevise` adds one Revising proposal when that agent has no Proposed or Revising proposal left. An Approved proposal does not block it. The caller supplies the id. The badge count is the number of Pending approvals plus the number of Proposed proposals. The model writes that sum in `BadgeMatches` and does not call `Count` from the invariant. The inbox is empty only when no approval is Pending and every proposal is Approved. The empty inbox shows "Nothing waiting. Your squads are working inside their limits."

A break lets an agent spend or change its mission without the matching task, last line, or badge.

## When this applies

Run this check when a change touches any of these:

- `packages/domain/src/policy/decide.ts` (`decideApproval`, `decideMission`, `askRevise`, `inboxCount`, `inboxIsEmpty`, `EMPTY_INBOX`)
- `packages/domain/test/decide.test.ts`
- `packages/adapters/src/neon/commands/approvals.ts`
- `apps/web/src/screens/overview/actions.ts`
- `packages/statecharts/approval/Approval.tla`
- `packages/statecharts/approval/Approval.cfg`
- `packages/statecharts/approval/view.mjs`
- `packages/statecharts/approval/chart.mmd`

A rename or a move of one of these functions is still a covered change.

## Run

Run the code check from the repository root:

```sh
node --experimental-strip-types --test packages/domain/test/decide.test.ts
```

Exit 0 means those functions still match the rules above. A failure is a break in the code. Do not change the test to hide it.

Then read the model with `/statechart`. The spec is `packages/statecharts/approval/Approval.tla`. The config is `packages/statecharts/approval/Approval.cfg`. The view is `packages/statecharts/approval/view.mjs`. The chart is `packages/statecharts/approval/chart.mmd`. `/statechart` is the only way to read the TLC result. Do not copy its command into this skill or into a script.

Exit 0 and a report that names no broken rule means the model holds. A broken rule is a finding. Do not weaken an invariant so that the run passes.

TLC does not read `decide.ts`. A pass of the model does not prove the TypeScript. Run both checks.

## What a failure means

A model failure is a path of Approve, Decline, Approve mission, Decline mission, or Ask to revise. It can also be a queued click, `WriteFail`, `WriteLate`, `ReadReload`, or `ReadTimeout`. Replay that path in `decideApproval`, `decideMission`, `askRevise`, the approval adapter, and the overview actions. If the code can do the path, the code is wrong. If the code cannot do a step, the model is wrong. Say which.

The chart hides Idle, ClickApprove, ClickDecline, ClickMission, ClickRevise, WriteFail, WriteLate, ReadReload, ReadTimeout, StartRead, and AcceptRead. Idle changes nothing. It exists so a finished inbox is not a deadlock. The chart also draws one "Nothing waiting" state for an approved mission with either an approved spend or a declined spend. The model still keeps those two states apart. The arrow from Pending to that state is labeled "Approve or Decline" because both spend commits end on the same chart state. `SpendApproved` and `SpendDeclined` check the task count and `last`. `EventRecorded` checks that a spend decision writes one bus event and that a mission decision writes none. `MandateRecorded` checks that only an approved spend has a Mandate. `WaitShape` checks one in-flight decision, at most one queued click, and that the same card is not in both. `WaitEnds` checks that a wait finishes. `StaleReadRejected` checks that a screen with the overlay off shows the tasks stored now.

## Keep the check in step

| Check | Covers | Sync commit |
| --- | --- | --- |
| `decide.test.ts` | `decideApproval`, `decideMission`, `askRevise`, `inboxCount`, `inboxIsEmpty`, `EMPTY_INBOX` | `d5d870b82614f0b6fd3e4e9bb264da142291e9e0` |
| `/statechart` on `Approval.tla` | The same actions, one approval and one proposal, the queue, a failed or late write, reload, the bus event, the Mandate, and a read that started before the write | `d5d870b82614f0b6fd3e4e9bb264da142291e9e0` |

Both checks passed on `d5d870b82614f0b6fd3e4e9bb264da142291e9e0`, the latest commit that changes these files. `decide.test.ts` exited 0. TLC exited 0, reached 266 states and 685 steps, and named no broken rule. The chart draws 8 states and 14 arrows.

Move a sync commit forward only after both checks pass and you confirm that the model and the tests still describe the code at the new commit. An intended change updates `decide.ts`, `decide.test.ts`, and `Approval.tla` together.

When covered code changed and this check was not run, use `/maintain-formal-verification-skill`.

## Bounds

The model is one spend approval and one mission proposal. One write is in flight, and one click can wait behind it. Clicks start at 3 and stay in 0..3. Approve and decline share the spend card, and mission and revise share the mission card, so the same card is not queued twice. Tasks start at 1 and can become 2. Contribution starts at 10 and becomes 0 only when the mission is approved. The empty sentence is the constant `EmptyInbox` in `Approval.cfg`, and it matches `EMPTY_INBOX`. A spend decision writes one bus event. An approved spend sets the Mandate. A declined spend leaves the Mandate false. A mission action and Ask to revise do not change the event count or the Mandate. A failed write and a late write leave the stored Approval and the Mandate unchanged and move the wait from write to read. A reload or a read timeout clears the wait, or starts the queued click. `WaitEnds` is `[](wait # "none" => <>(wait = "none"))`. Fairness is only on the real timers, `WriteLate` and `ReadTimeout`.

A click and every settled write set `stale` and turn the overlay on. `StartRead` runs only when `wait` is `none`. It copies `tasks` into `snapTasks` and clears `stale`. `AcceptRead` turns the overlay off only when `stale` is false, and it leaves `snapTasks` as it is. The browser orders the same reads with an integer write counter. The model uses the boolean mark. An integer counter from 0 to 6 reached 2,467 states, and the chart budget is 500, so the model keeps the order without the integer. A settle after the read starts sets `stale` again, so that read cannot replace the screen.

Removing the `stale = FALSE` guard from `AcceptRead` in a scratch copy makes TLC break `StaleReadRejected`. The shortest path is ClickApprove, ApproveSpend, AcceptRead. That run reached 477 states and 1,563 steps. The other rules held, including `WaitEnds` and `NoDeadlock`. The scratch copy is not in the repo.

The model does not cover a second approval, a second proposal, the target rows, or the other seven machines in `docs/PLAN.md`. The code test checks the em dash in each approved mission target. The model does not.
