# Agent on and off

Off means CPU 0% and uptime "Paused". A skill cannot run when the agent is Off. A change of autonomy does not change on or off. The screen shows Running only while the agent is On. Starting and Stopping each last one step. The screen shows Running for On and Paused for every other phase. It does not show the word Starting. The test adapter sets on inside `start` and `stop`, so Starting and Stopping are not visible. The stored CPU and uptime stay in the machine row. The provider chooses the shown CPU and uptime. An on machine whose stored uptime is "Paused" shows "Just started".

The chart hides Stay, ChangeAutonomy, RunSkill, and EndSkill. Stay changes nothing. ChangeAutonomy changes only the autonomy. RunSkill turns the skill on only while the agent is On. EndSkill turns the skill off.

## When this applies

Run this check when a change touches any of these:

- `packages/adapters/src/test-machine.ts`
- `packages/kernel/src/ports.ts`
- `packages/kernel/src/plugins/squads.ts`
- `packages/adapters/src/neon/commands/agents.ts`
- `packages/domain/src/squads/agent-commands.ts`
- `apps/web/src/screens/agent-detail/model.ts`
- `apps/web/src/server/agent-detail.ts`
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
| `/statechart` on `AgentOnOff.tla` | five phases, one label pair, a skill only while on, autonomy stays off the switch | TLC reached 33 states and 144 steps |

The checks name no commit, so a later head does not make this note stale. They keep the provider formula and the one-step start and stop. TLC named no broken rule. The rules are TypeOK, OffPaused, StartingPaused, OnRunning, StoppingPaused, PausedHold, ScreenLabel, SkillOff, NoDeadlock, and AutonomyStable. The chart draws 5 states and 5 arrows. The view hides 111 steps.

Update this note when the model or the on/off rules change. Record the TLC counts from that run. Do not name a commit. An intended change updates `test-machine.ts`, `agents.ts`, and `AgentOnOff.tla` together.

## Bounds

The model uses one agent, one skill flag, and three autonomy values. CPU is 0% or 22%. Uptime is Paused, Just started, or 18 days. The stored pair is 0% or 22%, and Paused or 18 days. The screen label is Running or Paused. Calls are none, start, or stop. Repeated switches use this finite set. The browser check covers a failed stop, a reload, the sidebar dot, and the stored row staying at 22% and 18 days while the page shows 0% and Paused.

TLC reached 33 states and 144 steps with no broken rule, including ScreenLabel, SkillOff, and AutonomyStable. The generated chart has 5 states and 5 arrows and hides 111 steps. Starting and Stopping are one step each. The screen does not show those words.
