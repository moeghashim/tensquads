---- MODULE Bus ----
\* One nextEvent adds one event and applies all of its writes in one step.
\* Live and Send next event take that same step.
\* A filter keeps the selected event in the inspector.
\* An id seen before changes nothing.
\* A dead letter makes one Escalation.
\* appendEvents writes the row and the store together. A repeat does not write.
\* A click during a wait is queued. The next idle step runs that one click.
\* A live tick does not queue. After a live commit the queued click still drains.
\* The code queues every click. This model keeps one click and one event.
\* # model: packages/domain/src/bus/traffic-commands.ts
\* # model: packages/adapters/src/neon/commands/traffic.ts
\* # model: packages/adapters/src/memory-bus.ts
\* # model: packages/adapters/src/cloudflare-bus/account-bus.ts
\* # model: packages/kernel/src/plugins/bus.ts
\* # model: packages/kernel/src/kernel.ts
\* # model: packages/adapters/src/neon/commands/bus.ts
\* # model: apps/web/src/workspace/live.ts

EXTENDS Integers

VARIABLES
    delivery, playback, selected, hidden, count, applied, appended,
    repeat, escalation, guard, manual,
    snapCount, snapApplied, snapDelivery, snapEscalation
vars == <<
    delivery, playback, selected, hidden, count, applied, appended,
    repeat, escalation, guard, manual,
    snapCount, snapApplied, snapDelivery, snapEscalation
>>

Deliveries == {"ready", "queued", "delivered", "acknowledged", "dead"}
Playbacks == {"Live", "Paused"}
Selections == {"none", "held"}
Bits == {0, 1}
Guards == {"idle", "waiting"}

CanAdd == repeat = FALSE /\ count = 0 /\ delivery = "ready" /\ guard = "idle" /\ manual = 0
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
    /\ manual \in Bits
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
    /\ manual = 0
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
    /\ manual' = 0

LiveStart ==
    /\ playback = "Live"
    /\ guard = "idle"
    /\ manual = 0
    /\ guard' = "waiting"
    /\ UNCHANGED <<delivery, playback, selected, hidden, count, applied, appended, repeat, escalation, manual, snapCount, snapApplied, snapDelivery, snapEscalation>>

\* A click during an open request waits. It does not start a second request.
SendWhileWaiting ==
    /\ guard = "waiting"
    /\ manual = 0
    /\ count = 0
    /\ delivery = "ready"
    /\ repeat = FALSE
    /\ manual' = 1
    /\ UNCHANGED <<delivery, playback, selected, hidden, count, applied, appended, repeat, escalation, guard, snapCount, snapApplied, snapDelivery, snapEscalation>>

\* The queued click adds the one event once the guard is idle and that event is still free.
QueuedSend ==
    /\ manual = 1
    /\ guard = "idle"
    /\ count = 0
    /\ delivery = "ready"
    /\ repeat = FALSE
    /\ Added
    /\ manual' = 0

\* A live commit already stored the one event. The queued click still runs.
\* A failed advance of that click clears it. This model keeps one row, so both leave the row.
QueuedDrain ==
    /\ manual = 1
    /\ guard = "idle"
    /\ count = 1
    /\ manual' = 0
    /\ UNCHANGED <<delivery, playback, selected, hidden, count, applied, appended, repeat, escalation, guard, snapCount, snapApplied, snapDelivery, snapEscalation>>

LiveCommit ==
    /\ WaitingAdd
    /\ Added
    /\ UNCHANGED <<manual>>

LiveExpire ==
    /\ guard = "waiting"
    /\ guard' = "idle"
    /\ UNCHANGED <<delivery, playback, selected, hidden, count, applied, appended, repeat, escalation, manual, snapCount, snapApplied, snapDelivery, snapEscalation>>

Stage ==
    /\ CanAdd
    /\ delivery' = "queued"
    /\ selected' = "held"
    /\ count' = 1
    /\ UNCHANGED <<playback, hidden, applied, appended, repeat, escalation, guard, manual, snapCount, snapApplied, snapDelivery, snapEscalation>>

Deliver ==
    /\ delivery = "queued"
    /\ repeat = FALSE
    /\ guard = "idle"
    /\ delivery' = "delivered"
    /\ UNCHANGED <<playback, selected, hidden, count, applied, appended, repeat, escalation, guard, manual, snapCount, snapApplied, snapDelivery, snapEscalation>>

Ack ==
    /\ delivery = "delivered"
    /\ repeat = FALSE
    /\ guard = "idle"
    /\ delivery' = "acknowledged"
    /\ applied' = TRUE
    /\ appended' = TRUE
    /\ UNCHANGED <<playback, selected, hidden, count, repeat, escalation, guard, manual, snapCount, snapApplied, snapDelivery, snapEscalation>>

Dead ==
    /\ delivery \in {"queued", "delivered"}
    /\ repeat = FALSE
    /\ guard = "idle"
    /\ delivery' = "dead"
    /\ escalation' = 1
    /\ UNCHANGED <<playback, selected, hidden, count, applied, appended, repeat, guard, manual, snapCount, snapApplied, snapDelivery, snapEscalation>>

Filter ==
    /\ selected = "held"
    /\ hidden = FALSE
    /\ guard = "idle"
    /\ delivery \in {"acknowledged", "dead"}
    /\ hidden' = TRUE
    /\ UNCHANGED <<delivery, playback, selected, count, applied, appended, repeat, escalation, guard, manual, snapCount, snapApplied, snapDelivery, snapEscalation>>

Clear ==
    /\ hidden = TRUE
    /\ guard = "idle"
    /\ hidden' = FALSE
    /\ UNCHANGED <<delivery, playback, selected, count, applied, appended, repeat, escalation, guard, manual, snapCount, snapApplied, snapDelivery, snapEscalation>>

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
    /\ UNCHANGED <<delivery, playback, selected, hidden, count, applied, appended, escalation, guard, manual>>

Pause ==
    /\ playback = "Live"
    /\ playback' = "Paused"
    /\ UNCHANGED <<delivery, selected, hidden, count, applied, appended, repeat, escalation, guard, manual, snapCount, snapApplied, snapDelivery, snapEscalation>>

Resume ==
    /\ playback = "Paused"
    /\ playback' = "Live"
    /\ UNCHANGED <<delivery, selected, hidden, count, applied, appended, repeat, escalation, guard, manual, snapCount, snapApplied, snapDelivery, snapEscalation>>

Next ==
    \/ SendNext
    \/ LiveStart
    \/ SendWhileWaiting
    \/ QueuedSend
    \/ QueuedDrain
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

\* A queued click runs once the guard is idle and the one event can still be added.
QueuedClickRuns ==
    [](manual = 1 /\ guard = "idle" /\ count = 0 /\ delivery = "ready" /\ repeat = FALSE
        => <>(manual = 0 /\ count = 1 /\ delivery = "acknowledged"))

\* Every queued click runs, or a failed advance clears it.
\* This does not ask count = 0. A click queued behind a live commit still drains.
AllClicksDrain == [](manual = 1 => <>(manual = 0))

Spec == Init /\ [][Next]_vars /\ WF_vars(LiveExpire) /\ WF_vars(QueuedSend) /\ WF_vars(QueuedDrain)
====
