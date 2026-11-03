# Rules and limits

A rule switch changes only that rule. A slider writes one `policy.*` key. The slider and the traffic table read that same key, so they show the same value. A limit change writes the state row and writes no event. A blank action adds no rule. A new rule is on, it is last, and only the action field clears. A later change to a rule or a limit does not change an existing Mandate. The rule text stored on the Mandate stays the text copied when the person said yes.

The model folds the recovery generation into a current or stale read marker. FailureDuringRead represents a later failed write or read while an older GET waits. Navigate represents a navigation loader. The chart hides AddBlank. AddBlank is a blank action. It changes nothing. A person can type an action after an add. The screen shows the snapshot plus a pending row. The snapshot changes only when a write response or a read arrives. A write response returns the row and replaces it. A failed or late write commits nothing, leaves the queue, and one read refreshes the snapshot. Each failed or late write sets the recovery flag before its read starts. Each failed or late read sets the flag and stops the wait. The loader samples the browser recovery generation before the GET. Only a successful read from the current generation clears the flag. An older read ends its wait and leaves a later failure set. A timed-out ad cap commits on arrival only when no newer ad cap has already landed. The next write ends in one read, or the screen loads again. A successful navigation read clears the flag before the screen opens, so the screen sends no second read. Server reads hold no recovery generation. The add clears the action. A second edit can type it again. One wait runs at a time, and that wait ends. One rule switch waits. The screen shows the next value, and the stored value waits for the response. The Monday rule stays off, and the reorder limit stays at the design value, so the chart stays within 500 states. The refund limit and the ad cap use the same write.

## When this applies

Run this check when a change touches any of these:

- `packages/domain/src/policy/rule-commands.ts`
- `packages/adapters/src/neon/commands/rules.ts`
- `packages/kernel/src/plugins/policy-rules.ts`
- `apps/web/src/server/rules.ts`
- `apps/web/src/screens/rules/screen.tsx`
- `apps/web/src/screens/rules/snapshot.ts`
- `apps/web/src/screens/rules/loader.ts`
- `apps/web/src/write-fence.ts`
- `packages/adapters/src/neon/commands/write-fence.ts`
- `apps/web/src/routes/_workspace/rules.tsx`
- `scripts/test/rules-writes.test.mjs`
- `apps/web/src/screens/rules/write-queue.ts`
- `packages/adapters/test/rules.test.ts`
- `packages/statecharts/rules/Rules.tla`
- `packages/statecharts/rules/Rules.cfg`
- `packages/statecharts/rules/view.mjs`
- `packages/statecharts/rules/chart.mmd`

A rename or a move of one of these files is still a covered change.

## Run

Run the code check from the repository root:

```sh
node --experimental-strip-types --test packages/adapters/test/rules.test.ts
```

Exit 0 means the rule commands still match the rules above. A failure is a break in the code. Do not change the test to hide it.

Run `node --test scripts/test/rules-writes.test.mjs` for switches, all three limits, Adds, read failures, read timeouts, stale reads, navigation, and server reads.

Then read the model with `/statechart`. The spec is `packages/statecharts/rules/Rules.tla`. The config is `packages/statecharts/rules/Rules.cfg`. The view is `packages/statecharts/rules/view.mjs`. The chart is `packages/statecharts/rules/chart.mmd`. `/statechart` is the only way to read the TLC result. Do not copy its command into this skill or into a script.

Exit 0 and a report that names no broken rule means the model holds. A broken rule is a finding. Do not weaken an invariant so that the run passes.

TLC does not read the TypeScript. A pass of the model does not prove the TypeScript. Run both checks.

## What a failure means

A model failure is a path of a rule switch, a limit move, a typed action, a blank add, or an add. Replay that path in `setRuleOn`, `addRule`, and `setLimit`. Replay the slider queue in `write-queue.ts`. If the code can do the path, the code is wrong. If the code cannot do a step, the model is wrong. Say which.

## Keep the check in step

| Check | Covers | Result |
| --- | --- | --- |
| `rules.test.ts` | one rule, one limit key, a blank add, a new rule, and a Mandate that stays | exit 0 |
| `/statechart` on `Rules.tla` | policy values, pending writes, current and stale recovery reads, navigation, a frozen Mandate, a late ad cap, and no limit event | TLC reached 487 states and 1958 steps |

The checks name no commit, so a later head does not make this note stale. TLC named no broken rule. The rules are TypeOK, ShownLimit, BoundedWait, MandateFrozen, NoLimitEvent, NewRuleOn, NoRuleYet, AddClearsAction, RuleText, NoDeadlock, WaitEnds, ReadKeepsStale, and FenceHolds. The chart draws 25 states and 55 arrows. The chart does not draw 44 steps that stay in one chart state. The view hides 207 steps.

Update this note when the model or the rule commands change. Record the TLC counts from that run. Do not name a commit. An intended change updates `commands/rules.ts`, `rules.test.ts`, and `Rules.tla` together.

## Bounds

Each limit is the design value or zero. The model has two rules and one new rule. The screen has the seed rules and the design minimum, maximum, and step. The browser check covers a switch, a slider, a blank action, a new rule, reload, and a Mandate read after those writes.

TLC reached 487 states and 1958 steps with no broken rule. The generated chart has 25 states and 55 arrows. The chart does not draw 44 steps that stay in one chart state. The view hides 207 steps.
