---
name: tensquads-verify
description: "Check the Approval inbox after a change to decideApproval, decideMission, askRevise, inboxCount, inboxIsEmpty, or packages/statecharts/approval. Use when an approve, a decline, a mission, a revise, or the inbox count changes."
---

# Approval inbox

An approve of a spend adds one task and sets `last` to the title plus " (approved)". A decline of a spend changes no agent field. An approve of a mission sets the mission, sets contribution to 0, and adds no task. A decline of a mission sets the proposal to Revising and changes no agent field. `askRevise` adds one Revising proposal when that agent has no Proposed or Revising proposal left. An Approved proposal does not block it. The caller supplies the id. The badge count is the number of Pending approvals plus the number of Proposed proposals. The model writes that sum in `BadgeMatches` and does not call `Count` from the invariant. The inbox is empty only when no approval is Pending and every proposal is Approved. The empty inbox shows "Nothing waiting. Your squads are working inside their limits."

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

The chart hides Idle. Idle changes nothing. It exists so a finished inbox is not a deadlock. The chart also draws one "Nothing waiting" state for an approved mission with either an approved spend or a declined spend. The model still keeps those two states apart. `SpendApproved` and `SpendDeclined` check the task count and `last`.

## Keep the check in step

| Check | Covers | Sync commit |
| --- | --- | --- |
| `decide.test.ts` | `decideApproval`, `decideMission`, `askRevise`, `inboxCount`, `inboxIsEmpty`, `EMPTY_INBOX` | `18fd6378854b33f70323e869c50757ce7c04ecd8` |
| `/statechart` on `Approval.tla` | The same actions, one approval and one proposal | `18fd6378854b33f70323e869c50757ce7c04ecd8` |

Both checks passed on `18fd6378854b33f70323e869c50757ce7c04ecd8`, the commit that adds `askRevise`. `decide.test.ts` exited 0. TLC exited 0, reached 12 states and 23 steps, and named no broken rule.

Move a sync commit forward only after both checks pass and you confirm that the model and the tests still describe the code at the new commit. An intended change updates `decide.ts`, `decide.test.ts`, and `Approval.tla` together.

When covered code changed and this check was not run, use `/maintain-formal-verification-skill`.

## Bounds

The model is one spend approval and one mission proposal. Tasks start at 1 and can become 2. Contribution starts at 10 and becomes 0 only when the mission is approved. The empty sentence is the constant `EmptyInbox` in `Approval.cfg`, and it matches `EMPTY_INBOX`.

The model does not cover a second approval, a second proposal, the bus, the target rows, or the other seven machines in `docs/PLAN.md`. The code test checks the em dash in each approved mission target. The model does not.

# Sign up

Sign-up starts at Business type. A new business pre-selects Marketing, Orders and Support. An existing business pre-selects Orders, Support, Finance and Inventory. Choose my squads always opens the squad list. Create my workspace opens the account form only when at least one squad is picked. Back goes one step and keeps the picked squads. Submit starts the request. The account is stored before overview opens. A failed response or a failed navigation leaves the form in place. Trying again uses the stored account and does not create a second one. The chart hides Stay. Stay changes nothing. It exists so Created is not a deadlock.

The model does not pick squads one by one. It turns the whole preset off, then back on. The screen can untick one squad. Zero picked still blocks the account form in both.

## When this applies

Run this check when a change touches any of these:

- `apps/web/src/screens/signup/machine.ts`
- `apps/web/src/screens/signup/machine.test.ts`
- `apps/web/src/screens/signup/SignupCard.tsx`
- `apps/web/src/screens/signup/signup-ui.tsx`
- `apps/web/src/screens/signup/SignupPage.tsx`
- `scripts/test/signup-submission.test.mjs`
- `packages/statecharts/signup/Signup.tla`
- `packages/statecharts/signup/Signup.cfg`
- `packages/statecharts/signup/view.mjs`
- `packages/statecharts/signup/chart.mmd`

A rename or a move of one of these files is still a covered change.

## Run

Run the code check from the repository root:

```sh
node --experimental-strip-types --test apps/web/src/screens/signup/machine.test.ts scripts/test/signup-submission.test.mjs
```

Exit 0 means the helpers and the screen transitions still match the rules above. A failure is a break in the code. Do not change the test to hide it.

Then read the model with `/statechart`. The spec is `packages/statecharts/signup/Signup.tla`. The config is `packages/statecharts/signup/Signup.cfg`. The view is `packages/statecharts/signup/view.mjs`. The chart is `packages/statecharts/signup/chart.mmd`. `/statechart` is the only way to read the TLC result. Do not copy its command into this skill or into a script.

Exit 0 and a report that names no broken rule means the model holds. A broken rule is a finding. Do not weaken an invariant so that the run passes.

TLC does not read `machine.ts`. A pass of the model does not prove the TypeScript. Run both checks.

## What a failure means

A model failure is a path of A new business, An existing business, Back, Choose my squads, Create my workspace, Try again, The request fails, Overview does not open, Untick the last squad, or Tick the squads again. Replay that path in `pickKind`, `openAccount`, and `togglePicked`, and through the Details and Back controls in `SignupCard` and `AccountStep`. Replay Submit, the stored account, a failed response, and a failed navigation through `SignupPage` to `/overview`. A retry must not insert a second account. If the code can do the path, the code is wrong. If the code cannot do a step, the model is wrong. Say which.

## Keep the check in step

| Check | Covers | Sync commit |
| --- | --- | --- |
| `machine.test.ts` | `initialSignup`, `pickKind`, `togglePicked`, `openAccount`, `summaryLine` | Pending verification |
| `signup-submission.test.mjs` | Details to Squads, Back from Account, Squads and Details, field and squad retention, creation to `/overview` | Pending verification |
| `/statechart` on `Signup.tla` | Type, Details, Squad, Account, the create request, a stored account, and a failed navigation | Pending verification |

TLC exited 0, reached 41 states and 84 steps, and named no broken rule. The chart draws 10 states and 20 arrows. It hides Stay. Move the sync commit to this change only after `machine.test.ts` and `signup-submission.test.mjs` also exit 0.

Move a sync commit forward only after both checks pass and you confirm that the model and the tests still describe the code at the new commit. An intended change updates `machine.ts`, `machine.test.ts`, and `Signup.tla` together.
