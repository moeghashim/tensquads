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
| `machine.test.ts` | `initialSignup`, `pickKind`, `togglePicked`, `openAccount`, `summaryLine` | `52dd87132519215e100845f625c608259faca83a` |
| `signup-submission.test.mjs` | Details to Squads, Back from Account, Squads and Details, field and squad retention, creation to `/overview` | `52dd87132519215e100845f625c608259faca83a` |
| `/statechart` on `Signup.tla` | Type, Details, Squad, Account, the create request, a stored account, and a failed navigation | `52dd87132519215e100845f625c608259faca83a` |

Both checks passed on `52dd87132519215e100845f625c608259faca83a`. `machine.test.ts` and `signup-submission.test.mjs` exited 0. TLC exited 0, reached 41 states and 84 steps, and named no broken rule. The chart draws 10 states and 20 arrows. It hides Stay.

Move a sync commit forward only after both checks pass and you confirm that the model and the tests still describe the code at the new commit. An intended change updates `machine.ts`, `machine.test.ts`, and `Signup.tla` together.
