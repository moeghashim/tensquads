---- MODULE AgentOnOff ----
\* Off means CPU 0% and uptime "Paused".
\* A skill cannot run when the agent is Off.
\* A change of autonomy does not change on or off.
\* The screen shows Running only while the agent is On.
\* Starting and Stopping each last one step.
\* A click enters the per-agent queue. The queue then fails, lands, or is late.
\* Late is the 30-second write deadline. A late write does not commit.
\* Failed and late each start a reload. A landed write reloads too.
\* A 30-second refresh timeout stays on the written screen and reads again.
\* A read that confirms the server ends the wait.
\* # model: packages/adapters/src/test-machine.ts
\* # model: packages/kernel/src/plugins/squads.ts
\* # model: packages/kernel/src/ports.ts
\* # model: packages/adapters/src/neon/commands/agents.ts
\* # model: packages/domain/src/squads/agent-commands.ts
\* # model: apps/web/src/screens/agent-detail/model.ts
\* # model: apps/web/src/screens/agent-detail/write.ts
\* # model: apps/web/src/server/agent-detail.ts

EXTENDS Integers

VARIABLES
    phase, cpu, uptime, storedCpu, storedUptime, skill, autonomy, label, calls, wait, tick
vars == <<
    phase, cpu, uptime, storedCpu, storedUptime, skill, autonomy, label, calls, wait, tick
>>

Phases == {"Off", "Starting", "On", "Stopping", "Paused"}
Waits == {"none", "queue", "failed", "late", "reload"}
Cpus == {"0%", "22%"}
Uptimes == {"Paused", "Just started", "18 days"}
StoredCpus == {"0%", "22%"}
StoredUptimes == {"Paused", "18 days"}
Autonomies == {"Ask first", "Auto under limit", "Full auto"}
Labels == {"Running", "Paused"}
Calls == {"none", "start", "stop"}

TypeOK ==
    /\ phase \in Phases
    /\ wait \in Waits
    /\ tick \in {0, 1}
    /\ cpu \in Cpus
    /\ uptime \in Uptimes
    /\ storedCpu \in StoredCpus
    /\ storedUptime \in StoredUptimes
    /\ skill \in BOOLEAN
    /\ autonomy \in Autonomies
    /\ label \in Labels
    /\ calls \in Calls

ShownOff == cpu = "0%" /\ uptime = "Paused" /\ label = "Paused" /\ skill = FALSE

OffPaused == phase = "Off" => ShownOff /\ calls = "none"
StartingPaused == phase = "Starting" => ShownOff /\ calls = "start"
StoppingPaused == phase = "Stopping" => ShownOff /\ calls = "stop"
PausedHold == phase = "Paused" => ShownOff /\ calls = "none"

OnRunning == phase = "On" =>
    /\ label = "Running"
    /\ calls = "none"
    /\ cpu = storedCpu
    /\ (storedUptime = "Paused" => uptime = "Just started")
    /\ (storedUptime = "18 days" => uptime = "18 days")

ScreenLabel == (label = "Running") <=> (phase = "On")

\* A skill runs only while the agent is On. This is the send() rule.
SkillOff == skill => phase = "On"

clock == UNCHANGED <<wait, tick>>
machine == UNCHANGED <<phase, cpu, uptime, storedCpu, storedUptime, skill, autonomy, label, calls>>

Stopped ==
    /\ phase = "Off"
    /\ storedCpu = "0%"
    /\ storedUptime = "Paused"
    /\ autonomy = "Ask first"
    /\ ShownOff
    /\ calls = "none"

Running ==
    /\ phase = "On"
    /\ storedCpu = "22%"
    /\ storedUptime = "18 days"
    /\ autonomy = "Auto under limit"
    /\ cpu = "22%"
    /\ uptime = "18 days"
    /\ skill = FALSE
    /\ label = "Running"
    /\ calls = "none"

Init == (Stopped \/ Running) /\ wait = "none" /\ tick = 0

stored == UNCHANGED <<storedCpu, storedUptime, autonomy>>

SwitchOn ==
    /\ phase \in {"Off", "Paused"}
    /\ phase' = "Starting"
    /\ calls' = "start"
    /\ cpu' = "0%"
    /\ uptime' = "Paused"
    /\ skill' = FALSE
    /\ label' = "Paused"
    /\ stored
    /\ clock

Boot ==
    /\ phase = "Starting"
    /\ phase' = "On"
    /\ calls' = "none"
    /\ cpu' = storedCpu
    /\ uptime' = IF storedUptime = "Paused" THEN "Just started" ELSE storedUptime
    /\ skill' = FALSE
    /\ label' = "Running"
    /\ stored
    /\ clock

SwitchOff ==
    /\ phase = "On"
    /\ phase' = "Stopping"
    /\ calls' = "stop"
    /\ cpu' = "0%"
    /\ uptime' = "Paused"
    /\ skill' = FALSE
    /\ label' = "Paused"
    /\ stored
    /\ clock

Halt ==
    /\ phase = "Stopping"
    /\ phase' = "Paused"
    /\ calls' = "none"
    /\ cpu' = "0%"
    /\ uptime' = "Paused"
    /\ skill' = FALSE
    /\ label' = "Paused"
    /\ stored
    /\ clock

ChangeAutonomy ==
    /\ autonomy' \in Autonomies
    /\ autonomy' # autonomy
    /\ UNCHANGED <<phase, cpu, uptime, storedCpu, storedUptime, skill, label, calls>>
    /\ clock

RunSkill ==
    /\ phase = "On"
    /\ skill = FALSE
    /\ skill' = TRUE
    /\ UNCHANGED <<phase, cpu, uptime, storedCpu, storedUptime, autonomy, label, calls>>
    /\ clock

EndSkill ==
    /\ skill = TRUE
    /\ skill' = FALSE
    /\ UNCHANGED <<phase, cpu, uptime, storedCpu, storedUptime, autonomy, label, calls>>
    /\ clock

EnterQueue ==
    /\ wait = "none"
    /\ wait' = "queue"
    /\ tick' = tick
    /\ machine

MarkFailed ==
    /\ wait = "queue"
    /\ wait' = "failed"
    /\ tick' = tick
    /\ machine

\* The 30-second write deadline. The row does not change.
MarkLate ==
    /\ wait = "queue"
    /\ wait' = "late"
    /\ tick' = tick
    /\ machine

MarkReload ==
    /\ wait = "queue"
    /\ wait' = "reload"
    /\ tick' = 0
    /\ machine

ReadAfterFailure ==
    /\ wait \in {"failed", "late"}
    /\ wait' = "reload"
    /\ tick' = 0
    /\ machine

ConfirmRead ==
    /\ wait = "reload"
    /\ wait' = "none"
    /\ tick' = 0
    /\ machine

\* The 30-second refresh bound. The written screen stays up.
RefreshTimeout ==
    /\ wait = "reload"
    /\ wait' = "reload"
    /\ tick' = IF tick = 0 THEN 1 ELSE 0
    /\ machine

Stay == UNCHANGED vars

Next ==
    \/ SwitchOn
    \/ Boot
    \/ SwitchOff
    \/ Halt
    \/ ChangeAutonomy
    \/ RunSkill
    \/ EndSkill
    \/ EnterQueue
    \/ MarkFailed
    \/ MarkLate
    \/ MarkReload
    \/ ReadAfterFailure
    \/ ConfirmRead
    \/ RefreshTimeout
    \/ Stay

\* A start reaches On, a stop reaches Paused, and every wait reaches none.
\* Those three do not have to be true in the same state.
\* Boot and Halt are the one-step machine timers.
\* MarkLate is the 30-second write deadline. RefreshTimeout is the 30-second read bound.
\* A failed or late write then reads, and a read in reload confirms. Those steps are fair
\* so a wait cannot stutter past them. The refresh timeout stays on the written screen.
WaitEnds ==
    /\ [](phase = "Starting" => <>(phase = "On"))
    /\ [](phase = "Stopping" => <>(phase = "Paused"))
    /\ [](wait # "none" => <>(wait = "none"))

Spec == Init /\ [][Next]_vars
    /\ WF_vars(Boot) /\ WF_vars(Halt)
    /\ WF_vars(MarkLate) /\ WF_vars(RefreshTimeout)
    /\ WF_vars(MarkFailed) /\ WF_vars(MarkReload)
    /\ WF_vars(ReadAfterFailure) /\ WF_vars(ConfirmRead)

\* A change of autonomy leaves the phase, the machine, the skill, and the label.
AutonomyStable ==
    [][autonomy' # autonomy =>
        UNCHANGED <<phase, cpu, uptime, storedCpu, storedUptime, skill, label, calls>>]_vars

====
