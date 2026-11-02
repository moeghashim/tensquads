---- MODULE Bus ----
\* One nextEvent adds one event and applies all of its writes in one step.
\* Live and Send next event take that same step.
\* A filter keeps the selected event in the inspector.
\* An id seen before changes nothing.
\* A dead letter makes one Escalation.
\* appendEvents writes the row and the store together. A repeat does not write.
\* # model: packages/domain/src/bus/traffic-commands.ts
\* # model: packages/adapters/src/neon/commands/traffic.ts
\* # model: packages/adapters/src/memory-bus.ts
\* # model: packages/kernel/src/plugins/bus.ts
\* # model: packages/kernel/src/kernel.ts
\* # model: packages/adapters/src/neon/commands/bus.ts
\* # model: apps/web/src/workspace/live.ts

EXTENDS Integers

VARIABLES
    delivery, playback, selected, hidden, count, applied, appended,
    repeat, escalation, guard,
    snapCount, snapApplied, snapDelivery, snapEscalation
vars == <<
    delivery, playback, selected, hidden, count, applied, appended,
    repeat, escalation, guard,
    snapCount, snapApplied, snapDelivery, snapEscalation
>>

Deliveries == {"ready", "queued", "delivered", "acknowledged", "dead"}
Playbacks == {"Live", "Paused"}
Selections == {"none", "held"}
Bits == {0, 1}
Guards == {"idle", "waiting"}

CanAdd == repeat = FALSE /\ count = 0 /\ delivery = "ready" /\ guard = "idle"
WaitingAdd == repeat = FALSE /\ count = 0 /\ delivery = "ready" /\ guard = "waiting"

TypeOK ==
    /\ delivery \in Deliveries
    /\ playback \in Playbacks
    /\ selected \in Selections
    /\ hidden \in BOOLEAN
    /\ count \in Bits
    /\ applied \in BOOLEAN
    /\ appended \in BOOLEAN
    /\ repeat \in BOOLEAN
    /\ escalation \in Bits
    /\ guard \in Guards
    /\ snapCount \in Bits
    /\ snapApplied \in BOOLEAN
    /\ snapDelivery \in Deliveries
    /\ snapEscalation \in Bits

\* An acknowledged event has its row and its writes.
\* A queued, delivered, ready, or dead event has no writes yet.
WritesMatch ==
    /\ delivery = "acknowledged" => applied
    /\ delivery \in {"ready", "queued", "delivered", "dead"} => ~applied
    /\ applied => count = 1

\* The row and the writes land together. appendEvents does both.
AppendsWithWrites ==
    /\ appended <=> applied
    /\ delivery = "acknowledged" => appended
    /\ delivery \in {"ready", "queued", "delivered", "dead"} => ~appended

\* A dead letter makes one Escalation, and only a dead letter does.
OneEscalation ==
    /\ delivery = "dead" <=> escalation = 1
    /\ escalation \in Bits

\* A filter keeps the selected event in the inspector.
FilterKeepsInspector == hidden => selected = "held"

\* An id seen before changes nothing.
RepeatHolds ==
    repeat =>
        /\ count = snapCount
        /\ applied = snapApplied
        /\ delivery = snapDelivery
        /\ escalation = snapEscalation
        /\ appended = applied

Init ==
    /\ delivery = "ready"
    /\ playback = "Paused"
    /\ selected = "none"
    /\ hidden = FALSE
    /\ count = 0
    /\ applied = FALSE
    /\ appended = FALSE
    /\ repeat = FALSE
    /\ escalation = 0
    /\ guard = "idle"
    /\ snapCount = 0
    /\ snapApplied = FALSE
    /\ snapDelivery = "ready"
    /\ snapEscalation = 0

\* The test adapter passes Queued to Acknowledged in one step.
Added ==
    /\ delivery' = "acknowledged"
    /\ selected' = "held"
    /\ count' = 1
    /\ applied' = TRUE
    /\ appended' = TRUE
    /\ guard' = "idle"
    /\ UNCHANGED <<playback, hidden, repeat, escalation, snapCount, snapApplied, snapDelivery, snapEscalation>>

SendNext ==
    /\ CanAdd
    /\ Added

LiveStart ==
    /\ playback = "Live"
    /\ guard = "idle"
    /\ guard' = "waiting"
    /\ UNCHANGED <<delivery, playback, selected, hidden, count, applied, appended, repeat, escalation, snapCount, snapApplied, snapDelivery, snapEscalation>>

LiveCommit ==
    /\ WaitingAdd
    /\ Added

LiveExpire ==
    /\ guard = "waiting"
    /\ guard' = "idle"
    /\ UNCHANGED <<delivery, playback, selected, hidden, count, applied, appended, repeat, escalation, snapCount, snapApplied, snapDelivery, snapEscalation>>

Stage ==
    /\ CanAdd
    /\ delivery' = "queued"
    /\ selected' = "held"
    /\ count' = 1
    /\ UNCHANGED <<playback, hidden, applied, appended, repeat, escalation, guard, snapCount, snapApplied, snapDelivery, snapEscalation>>

Deliver ==
    /\ delivery = "queued"
    /\ repeat = FALSE
    /\ guard = "idle"
    /\ delivery' = "delivered"
    /\ UNCHANGED <<playback, selected, hidden, count, applied, appended, repeat, escalation, guard, snapCount, snapApplied, snapDelivery, snapEscalation>>

Ack ==
    /\ delivery = "delivered"
    /\ repeat = FALSE
    /\ guard = "idle"
    /\ delivery' = "acknowledged"
    /\ applied' = TRUE
    /\ appended' = TRUE
    /\ UNCHANGED <<playback, selected, hidden, count, repeat, escalation, guard, snapCount, snapApplied, snapDelivery, snapEscalation>>

Dead ==
    /\ delivery \in {"queued", "delivered"}
    /\ repeat = FALSE
    /\ guard = "idle"
    /\ delivery' = "dead"
    /\ escalation' = 1
    /\ UNCHANGED <<playback, selected, hidden, count, applied, appended, repeat, guard, snapCount, snapApplied, snapDelivery, snapEscalation>>

Filter ==
    /\ selected = "held"
    /\ hidden = FALSE
    /\ guard = "idle"
    /\ delivery \in {"acknowledged", "dead"}
    /\ hidden' = TRUE
    /\ UNCHANGED <<delivery, playback, selected, count, applied, appended, repeat, escalation, guard, snapCount, snapApplied, snapDelivery, snapEscalation>>

Clear ==
    /\ hidden = TRUE
    /\ guard = "idle"
    /\ hidden' = FALSE
    /\ UNCHANGED <<delivery, playback, selected, count, applied, appended, repeat, escalation, guard, snapCount, snapApplied, snapDelivery, snapEscalation>>

Repeat ==
    /\ repeat = FALSE
    /\ count = 1
    /\ delivery \in {"acknowledged", "dead"}
    /\ guard = "idle"
    /\ repeat' = TRUE
    /\ snapCount' = count
    /\ snapApplied' = applied
    /\ snapDelivery' = delivery
    /\ snapEscalation' = escalation
    /\ UNCHANGED <<delivery, playback, selected, hidden, count, applied, appended, escalation, guard>>

Pause ==
    /\ playback = "Live"
    /\ playback' = "Paused"
    /\ UNCHANGED <<delivery, selected, hidden, count, applied, appended, repeat, escalation, guard, snapCount, snapApplied, snapDelivery, snapEscalation>>

Resume ==
    /\ playback = "Paused"
    /\ playback' = "Live"
    /\ UNCHANGED <<delivery, selected, hidden, count, applied, appended, repeat, escalation, guard, snapCount, snapApplied, snapDelivery, snapEscalation>>

Next ==
    \/ SendNext
    \/ LiveStart
    \/ LiveCommit
    \/ LiveExpire
    \/ Stage
    \/ Deliver
    \/ Ack
    \/ Dead
    \/ Filter
    \/ Clear
    \/ Repeat
    \/ Pause
    \/ Resume

WaitEnds == [](guard = "waiting" => <>(guard = "idle"))

Spec == Init /\ [][Next]_vars /\ WF_vars(LiveExpire)
====
