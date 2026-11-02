---- MODULE AgentOnOff ----
\* Off means CPU 0% and uptime "Paused".
\* A skill cannot run when the agent is Off.
\* A change of autonomy does not change on or off.
\* The screen shows Running only while the agent is On.
\* Starting and Stopping each last one step.
\* # model: packages/adapters/src/test-machine.ts
\* # model: packages/kernel/src/plugins/squads.ts
\* # model: packages/kernel/src/ports.ts
\* # model: packages/adapters/src/neon/commands/agents.ts
\* # model: packages/domain/src/squads/agent-commands.ts
\* # model: apps/web/src/screens/agent-detail/model.ts

EXTENDS Integers

VARIABLES
    phase, cpu, uptime, storedCpu, storedUptime, skill, autonomy, label, calls
vars == <<
    phase, cpu, uptime, storedCpu, storedUptime, skill, autonomy, label, calls
>>

Phases == {"Off", "Starting", "On", "Stopping", "Paused"}
Cpus == {"0%", "22%"}
Uptimes == {"Paused", "Just started", "18 days"}
StoredCpus == {"0%", "22%"}
StoredUptimes == {"Paused", "18 days"}
Autonomies == {"Ask first", "Auto under limit", "Full auto"}
Labels == {"Running", "Paused"}
Calls == {"none", "start", "stop"}

TypeOK ==
    /\ phase \in Phases
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

Init == Stopped \/ Running

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

Boot ==
    /\ phase = "Starting"
    /\ phase' = "On"
    /\ calls' = "none"
    /\ cpu' = storedCpu
    /\ uptime' = IF storedUptime = "Paused" THEN "Just started" ELSE storedUptime
    /\ skill' = FALSE
    /\ label' = "Running"
    /\ stored

SwitchOff ==
    /\ phase = "On"
    /\ phase' = "Stopping"
    /\ calls' = "stop"
    /\ cpu' = "0%"
    /\ uptime' = "Paused"
    /\ skill' = FALSE
    /\ label' = "Paused"
    /\ stored

Halt ==
    /\ phase = "Stopping"
    /\ phase' = "Paused"
    /\ calls' = "none"
    /\ cpu' = "0%"
    /\ uptime' = "Paused"
    /\ skill' = FALSE
    /\ label' = "Paused"
    /\ stored

ChangeAutonomy ==
    /\ autonomy' \in Autonomies
    /\ autonomy' # autonomy
    /\ UNCHANGED <<phase, cpu, uptime, storedCpu, storedUptime, skill, label, calls>>

RunSkill ==
    /\ phase = "On"
    /\ skill = FALSE
    /\ skill' = TRUE
    /\ UNCHANGED <<phase, cpu, uptime, storedCpu, storedUptime, autonomy, label, calls>>

EndSkill ==
    /\ skill = TRUE
    /\ skill' = FALSE
    /\ UNCHANGED <<phase, cpu, uptime, storedCpu, storedUptime, autonomy, label, calls>>

Stay == UNCHANGED vars

Next ==
    \/ SwitchOn
    \/ Boot
    \/ SwitchOff
    \/ Halt
    \/ ChangeAutonomy
    \/ RunSkill
    \/ EndSkill
    \/ Stay

Spec == Init /\ [][Next]_vars

\* A change of autonomy leaves the phase, the machine, the skill, and the label.
AutonomyStable ==
    [][autonomy' # autonomy =>
        UNCHANGED <<phase, cpu, uptime, storedCpu, storedUptime, skill, label, calls>>]_vars

====
