# Agent on and off

Off means CPU 0% and uptime "Paused". A skill cannot run when the agent is Off. A change of autonomy does not change on or off. The screen shows Running only while the agent is On. A start or stop has a deadline. Starting ends at On or back at Off, and Stopping ends at Paused. The screen shows Running for On and Paused for every other phase. It does not show the word Starting. The test adapter sets on inside `start` and `stop`, so Starting and Stopping are not visible. The stored CPU and uptime stay in the machine row. The provider chooses the shown CPU and uptime. An on machine whose stored uptime is "Paused" shows "Just started".

The chart hides Stay, ChangeAutonomy, RunSkill, EndSkill, OpenOlder, CommitNewer, ArriveOlder, ArriveOlderFirst, and CommitAfterOlder. Stay changes nothing. ChangeAutonomy changes only the autonomy. RunSkill turns the skill on only while the agent is On. EndSkill turns the skill off. A successful write response supplies the view and ends the wait. Failed and late each start one recovery read. The read ends on its response or its timer and does not loop. A recovery read that started before a later failure does not end that failure. The old read's return or its bound leaves that failure its own read. The model records one later failure, and the successor read is not overtaken. A newer stored on stays when an older write arrives after it. An older off that arrives first is replaced by the newer on. A start reaches On or its deadline returns the agent to Off. A stop reaches Paused. Every wait reaches none. Fairness is only on MarkLate, RefreshTimeout, and the start or stop deadline, each alone. Boot and Halt have none. Read success is not assumed.

## When this applies

Run this check when a change touches any of these:

- `packages/adapters/src/test-machine.ts`
- `packages/kernel/src/ports.ts`
- `packages/kernel/src/plugins/squads.ts`
- `packages/adapters/src/neon/commands/agents.ts`
- `packages/domain/src/squads/agent-commands.ts`
- `apps/web/src/screens/agent-detail/model.ts`
- `apps/web/src/screens/agent-detail/write.ts`
- `apps/web/src/server/agent-detail.ts`
- `apps/web/src/write-fence.ts`
- `packages/adapters/src/neon/commands/write-fence.ts`
- `packages/statecharts/agent-onoff/AgentOnOff.tla`
- `packages/statecharts/agent-onoff/AgentOnOff.cfg`
- `packages/statecharts/agent-onoff/view.mjs`
- `packages/statecharts/agent-onoff/chart.mmd`

A rename or a move of one of these files is still a covered change.

## Run

Run the code check from the repository root:

```sh
node --experimental-strip-types --test packages/adapters/test/adapters.test.ts
```

Exit 0 means the provider still shows 0% and "Paused" when off, and "Just started" when an on machine stored "Paused". A failure is a break in the code. Do not change the test to hide it.

Then read the model with `/statechart`. The spec is `packages/statecharts/agent-onoff/AgentOnOff.tla`. The config is `packages/statecharts/agent-onoff/AgentOnOff.cfg`. The view is `packages/statecharts/agent-onoff/view.mjs`. The chart is `packages/statecharts/agent-onoff/chart.mmd`. `/statechart` is the only way to read the TLC result. Do not copy its command into this skill or into a script.

Exit 0 and a report that names no broken rule means the model holds. A broken rule is a finding. Do not weaken an invariant so that the run passes.

TLC does not read `test-machine.ts`. A pass of the model does not prove the TypeScript. Run both checks.

## What a failure means

A model failure is a path of switch on, boot, switch off, halt, a skill while off, or an autonomy change that moves on or off. Replay that path in `createTestMachine`, `commitAgentOn`, and `setAgentOn`. Replay the shown CPU and uptime in the agent detail loader. If the code can do the path, the code is wrong. If the code cannot do a step, the model is wrong. Say which.

## Keep the check in step

| Check | Covers | Result |
| --- | --- | --- |
| `adapters.test.ts` | off shows 0% and Paused, and a paused store shows Just started when on | exit 0 |
| `/statechart` on `AgentOnOff.tla` | five phases, queue, failed, late, and reload, one later failure during an open recovery, one label pair, a skill only while on, autonomy stays off the switch, a start or stop deadline, every wait reaches none, and a newer stored on survives an older arrival | TLC reached 296 states and 1974 steps |

The checks name no commit, so a later head does not make this note stale. They keep the provider formula and the deadline on a start or stop. TLC named no broken rule. The rules are TypeOK, OffPaused, StartingPaused, OnRunning, StoppingPaused, PausedHold, ScreenLabel, SkillOff, FenceKeepsNewer, NoDeadlock, AutonomyStable, WaitEnds, and StaleReadKeepsFailure. The chart draws 10 states and 37 arrows. The chart does not draw 336 steps that stay in one chart state. The view hides 978 steps. The state "A later write failed" uses the Failed color.

Update this note when the model or the on/off rules change. Record the TLC counts from that run. Do not name a commit. An intended change updates `test-machine.ts`, `agents.ts`, and `AgentOnOff.tla` together.

## Bounds

The model uses one agent, one skill flag, and three autonomy values. CPU is 0% or 22%. Uptime is Paused, Just started, or 18 days. The stored pair is 0% or 22%, and Paused or 18 days. The screen label is Running or Paused. Calls are none, start, or stop. Repeated switches use this finite set. One open recovery can be overtaken by one later failure. The successor read is not overtaken again. The browser check covers a failed stop, a reload, a stale loader, an old recovery over a lost response, the sidebar dot, and the stored row staying at 22% and 18 days while the page shows 0% and Paused.

TLC reached 296 states and 1974 steps with no broken rule, including ScreenLabel, SkillOff, AutonomyStable, WaitEnds, StaleReadKeepsFailure, and FenceKeepsNewer. The generated chart has 10 states and 37 arrows. It does not draw 336 steps that stay in one chart state, and the view hides 978 steps. A start or stop has a deadline, and fairness is on that deadline alone. The screen does not show the words Starting or Stopping. The recovery read ends on its timer and does not loop. An older recovery does not end a later failure. A newer stored on stays after the older write arrives.
