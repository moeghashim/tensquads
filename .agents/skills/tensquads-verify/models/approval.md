# Approval inbox

An approve of a spend adds one task and sets `last` to the title plus " (approved)". A decline of a spend changes no agent field. An approve of a spend writes one bus event and one Mandate. A decline of a spend writes one bus event and no Mandate. An approve of a mission sets the mission, sets contribution to 0, and adds no task. A decline of a mission sets the proposal to Revising and changes no agent field. A mission decision writes no bus event and no Mandate. `askRevise` adds one Revising proposal when that agent has no Proposed or Revising proposal left. An Approved proposal does not block it. The caller supplies the id. The badge count is the number of Pending approvals plus the number of Proposed proposals. The model writes that sum in `BadgeMatches` and does not call `Count` from the invariant. The inbox is empty only when no approval is Pending and every proposal is Approved. The empty inbox shows "Nothing waiting. Your squads are working inside their limits."

A break lets an agent spend or change its mission without the matching task, last line, or badge.

## When this applies

Run this check when a change touches any of these:

- `packages/domain/src/policy/decide.ts` (`decideApproval`, `decideMission`, `askRevise`, `inboxCount`, `inboxIsEmpty`, `EMPTY_INBOX`)
- `packages/domain/test/decide.test.ts`
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

A model failure is a path of Approve, Decline, Approve mission, Decline mission, or Ask to revise. Replay that path in `decideApproval`, `decideMission`, or `askRevise`. If the code can do the path, the code is wrong. If the code cannot do a step, the model is wrong. Say which.

The chart hides Idle. Idle changes nothing. It exists so a finished inbox is not a deadlock. The chart also draws one "Nothing waiting" state for an approved mission with either an approved spend or a declined spend. The model still keeps those two states apart. `SpendApproved` and `SpendDeclined` check the task count and `last`. `EventRecorded` checks that a spend decision writes one bus event and that a mission decision writes none. `MandateRecorded` checks that only an approved spend has a Mandate.

## Keep the check in step

| Check | Covers | Sync commit |
| --- | --- | --- |
| `decide.test.ts` | `decideApproval`, `decideMission`, `askRevise`, `inboxCount`, `inboxIsEmpty`, `EMPTY_INBOX` | `8667dc8817e0c1e9d7d39b8cf3303f6bf6128f0e` |
| `/statechart` on `Approval.tla` | The same actions, one approval and one proposal, the bus event, and the Mandate | `8667dc8817e0c1e9d7d39b8cf3303f6bf6128f0e` |

Both checks passed on `8667dc8817e0c1e9d7d39b8cf3303f6bf6128f0e`, the latest commit that changes these files. `decide.test.ts` exited 0. TLC exited 0, reached 12 states and 23 steps, and named no broken rule.

Move a sync commit forward only after both checks pass and you confirm that the model and the tests still describe the code at the new commit. An intended change updates `decide.ts`, `decide.test.ts`, and `Approval.tla` together.

When covered code changed and this check was not run, use `/maintain-formal-verification-skill`.

## Bounds

The model is one spend approval and one mission proposal. Tasks start at 1 and can become 2. Contribution starts at 10 and becomes 0 only when the mission is approved. The empty sentence is the constant `EmptyInbox` in `Approval.cfg`, and it matches `EMPTY_INBOX`. A spend decision writes one bus event. An approved spend sets the Mandate. A declined spend leaves the Mandate false. A mission action and Ask to revise do not change the event count or the Mandate.

The model does not cover a second approval, a second proposal, the target rows, or the other seven machines in `docs/PLAN.md`. The code test checks the em dash in each approved mission target. The model does not.
