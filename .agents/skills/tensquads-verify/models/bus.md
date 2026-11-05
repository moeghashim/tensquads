# Bus event and shared state

`nextEvent()` adds one event and applies all of its writes in one step. Live and Send next event take that same step. A filter can remove the selected row from the list. The inspector keeps the event. An id seen before changes nothing. A dead letter makes one Escalation. `appendEvents` writes the row and the store together. A repeat id does not write. The test adapter passes from Queued to Acknowledged in one step. Queued, Delivered, and Dead letter are in the model. The screen does not show them. The in-memory bus does not dead-letter. A click during an open request is queued. Each click runs one advance, in order, one at a time. A live tick does not queue: a tick while a request is open is skipped, so ticks never pile up. After a live commit the queued click still drains. The model keeps that one stored row. A failed advance of that click clears it and also leaves the row. Advance and refresh each wait at most 30 seconds, in sequence, so the guard clears within about 60 seconds in the worst case. The wait is weakly fair, so a queued click or a timed-out tick cannot stay waiting.

The chart hides Pause, Resume, and Repeat. It also hides a live tick that starts away from Ready, a wait that ends away from Ready, and a filter on a delivery the screen does not show. Pause and Resume keep the playback. Repeat records the current event and changes nothing.

## When this applies

Run this check when a change touches any of these:

- `packages/domain/src/bus/traffic-commands.ts`
- `packages/adapters/src/neon/commands/traffic.ts`
- `packages/adapters/src/memory-bus.ts`
- `packages/adapters/src/cloudflare-bus/account-bus.ts`
- `packages/kernel/src/plugins/bus.ts`
- `packages/kernel/src/kernel.ts`
- `packages/adapters/src/neon/commands/bus.ts`
- `apps/web/src/workspace/live.ts`
- `packages/statecharts/bus/Bus.tla`
- `packages/statecharts/bus/Bus.cfg`
- `packages/statecharts/bus/view.mjs`
- `packages/statecharts/bus/chart.mmd`

A rename or a move of one of these files is still a covered change.

## Run

Run the code check from the repository root:

```sh
node --experimental-strip-types --test packages/adapters/test/traffic.test.ts
```

Exit 0 means one `nextEvent` adds one row and applies its writes in one transaction, and a repeat id changes nothing. A failure is a break in the code. Do not change the test to hide it.

Then read the model with `/statechart`. The spec is `packages/statecharts/bus/Bus.tla`. The config is `packages/statecharts/bus/Bus.cfg`. The view is `packages/statecharts/bus/view.mjs`. The chart is `packages/statecharts/bus/chart.mmd`. `/statechart` is the only way to read the TLC result. Do not copy its command into this skill or into a script.

Exit 0 and a report that names no broken rule means the model holds. A broken rule is a finding. Do not weaken an invariant so that the run passes.

TLC does not read `traffic.ts`. A pass of the model does not prove the TypeScript. Run both checks.

## What a failure means

A model failure is a path of Send next event, a queued click, a live tick, a wait that ends, a queue, a delivery, an acknowledgement, a dead letter, a filter, or a repeat. Replay that path in `nextEvent` and `runLiveTick`. If the code can do the path, the code is wrong. If the code cannot do a step, the model is wrong. Say which. A fault in `appendEvents` stops the work. Its signature does not change.

## Keep the check in step

| Check | Covers | Result |
| --- | --- | --- |
| `traffic.test.ts` | one row, all writes, one transaction, a repeat id | exit 0 |
| `/statechart` on `Bus.tla` | one step, the inspector, a repeat id, one escalation, one queued click, the drain after a live commit, the 60 second guard | TLC reached 56 states and 155 steps |

The checks name no commit, so a later head does not make this note stale. TLC named no broken rule. The rules are TypeOK, WritesMatch, AppendsWithWrites, OneEscalation, FilterKeepsInspector, RepeatHolds, NoDeadlock, WaitEnds, QueuedClickRuns, and AllClicksDrain. The chart draws 8 states and 13 arrows. The view hides 108 steps.

Update this note when the model or the bus rules change. Record the TLC counts from that run. Do not name a commit.

## Bounds

The model tracks one event. `count` is 0 or 1. A repeat does not add a second row. The model keeps one queued click. The code queues every click. A live tick does not queue. After a live commit the queued click drains, and the model leaves the stored row. AllClicksDrain says every queued click runs or a failed advance clears it. The model does not model the pre-transaction server read, real elapsed time, or every queued click. The code test walks the eight-event script and the wrap. The clock, the event ids, and the store values are in the code test. The model does not count the hub, the chips, or the artboard. The browser check covers Live on another page, Send next event, a hung request, and the empty bus.
