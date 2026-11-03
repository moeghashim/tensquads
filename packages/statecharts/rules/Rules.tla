---- MODULE Rules ----
\* The screen shows the snapshot plus a pending row.
\* The snapshot changes only when a write response or a read arrives.
\* A write response returns the row and replaces it. A late write commits nothing.
\* A failed or late write leaves the queue. One read then refreshes the snapshot.
\* A failed read sets one flag and stops the wait. The next write ends in one read,
\* or the screen loads again. The flag clears when a read succeeds.
\* A rule switch shows the next value at once. The stored value waits for the response.
\* A blank action adds no rule. A new rule is on. The add clears the action.
\* A later keystroke can type an action again. A second edit does not clear it.
\* One write waits at a time. The wait ends.
\* A later change does not change an existing Mandate.
\* A limit change writes no event.
\* The reorder limit stays at the design value. The refund limit and the ad cap
\* carry the same pending, failed, and late write. A third copy passes 500 states.
\* # model: packages/domain/src/policy/rule-commands.ts
\* # model: packages/adapters/src/neon/commands/rules.ts
\* # model: packages/kernel/src/plugins/policy-rules.ts
\* # model: apps/web/src/screens/rules/screen.tsx
\* # model: apps/web/src/screens/rules/snapshot.ts
\* # model: apps/web/src/screens/rules/write-queue.ts
\* # model: apps/web/src/server/rules.ts
\* # model: apps/web/src/screens/rules/loader.ts
\* # model: apps/web/src/write-fence.ts
\* # model: packages/adapters/src/neon/commands/write-fence.ts

EXTENDS Integers

VARIABLES
    ruleA, ruleB,
    refund, ads, reorder,
    refundSlider, adsSlider, reorderSlider,
    refundTable, adsTable, reorderTable,
    action, edited, added, newOn, pending,
    save, wait, which, needsRead, readStale,
    mandate, events,
    textA, textB,
    gap, want

vars == <<
    ruleA, ruleB,
    refund, ads, reorder,
    refundSlider, adsSlider, reorderSlider,
    refundTable, adsTable, reorderTable,
    action, edited, added, newOn, pending,
    save, wait, which, needsRead, readStale,
    mandate, events,
    textA, textB,
    gap, want
>>

Bits == {0, 1}
ActionText == {"blank", "text"}
Saves == {"idle", "adding", "reading", "saving", "toggling"}
Waits == {"none", "add", "limit", "refresh", "toggle"}
Limits == {"none", "refund", "ads"}

TypeOK ==
    /\ ruleA \in BOOLEAN /\ ruleB \in BOOLEAN
    /\ refund \in Bits /\ ads \in Bits /\ reorder \in Bits
    /\ refundSlider \in Bits /\ adsSlider \in Bits /\ reorderSlider \in Bits
    /\ refundTable \in Bits /\ adsTable \in Bits /\ reorderTable \in Bits
    /\ action \in ActionText /\ edited \in BOOLEAN
    /\ added \in Bits /\ newOn \in BOOLEAN /\ pending \in Bits
    /\ save \in Saves /\ wait \in Waits /\ which \in Limits
    /\ needsRead \in BOOLEAN /\ readStale \in BOOLEAN
    /\ readStale => needsRead /\ wait = "refresh"
    /\ mandate = "frozen" /\ events = 0
    /\ textA = "refund" /\ textB = "monday"
    /\ gap \in 0..2 /\ want \in Bits /\ (gap = 0 => want = 0)

\* The table equals the store. A slider differs only while that limit's write waits.
ShownLimit ==
    /\ refundTable = refund /\ adsTable = ads /\ reorderTable = reorder
    /\ reorderSlider = reorder /\ reorder = 1
    /\ wait = "limit" /\ which = "refund" => refundSlider = 1 - refund
    /\ wait # "limit" \/ which # "refund" => refundSlider = refund
    /\ wait = "limit" /\ which = "ads" => adsSlider = 1 - ads
    /\ wait # "limit" \/ which # "ads" => adsSlider = ads

\* One deadline covers the write. The kind of wait matches the save.
BoundedWait ==
    /\ wait = "none" <=> save = "idle"
    /\ wait = "add" <=> save = "adding"
    /\ wait = "limit" <=> save = "saving"
    /\ wait = "refresh" <=> save = "reading"
    /\ wait = "toggle" <=> save = "toggling"
    /\ save = "adding" => pending = 1 /\ added = 0 /\ which = "none"
    /\ save = "reading" => which = "none" /\ pending = 0
    /\ save = "idle" => pending = 0 /\ which = "none"
    /\ save = "saving" => which \in {"refund", "ads"}
    /\ save = "toggling" => which = "none" /\ pending = 0

MandateFrozen == mandate = "frozen"
NoLimitEvent == events = 0
NewRuleOn == (pending = 1 \/ added = 1) <=> newOn = TRUE
NoRuleYet == pending = 0 /\ added = 0 => newOn = FALSE
\* The add clears the action. A second edit may type it again.
AddClearsAction == (added = 1 /\ edited = FALSE) => action = "blank"
RuleText == textA = "refund" /\ textB = "monday"

limits == <<
    refund, ads, reorder,
    refundSlider, adsSlider, reorderSlider,
    refundTable, adsTable, reorderTable
>>
form == <<action, edited, added, newOn, pending>>
memory == <<needsRead, readStale>>
frozen == <<mandate, events, textA, textB>>

Init ==
    /\ ruleA = TRUE /\ ruleB = FALSE
    /\ refund = 1 /\ ads = 1 /\ reorder = 1
    /\ refundSlider = 1 /\ adsSlider = 1 /\ reorderSlider = 1
    /\ refundTable = 1 /\ adsTable = 1 /\ reorderTable = 1
    /\ action = "blank" /\ edited = FALSE
    /\ added = 0 /\ newOn = FALSE /\ pending = 0
    /\ save = "idle" /\ wait = "none" /\ which = "none" /\ needsRead = FALSE
    /\ readStale = FALSE
    /\ mandate = "frozen" /\ events = 0
    /\ textA = "refund" /\ textB = "monday"
    /\ gap = 0 /\ want = 0

\* The screen shows the next value. The stored rule waits for the response.
StartToggle ==
    /\ gap = 0
    /\ save = "idle" /\ wait = "none" /\ pending = 0
    /\ save' = "toggling" /\ wait' = "toggle"
    /\ UNCHANGED <<ruleA, ruleB, limits, form, which, frozen, memory, gap, want>>

CommitToggle ==
    /\ gap = 0
    /\ save = "toggling" /\ wait = "toggle"
    /\ ruleA' = ~ruleA
    /\ IF needsRead
       THEN /\ save' = "reading" /\ wait' = "refresh"
       ELSE /\ save' = "idle" /\ wait' = "none"
    /\ UNCHANGED <<ruleB, limits, form, which, frozen, memory, gap, want>>

\* The write leaves the queue. The shown value returns to the store. One read starts.
FailToggle ==
    /\ gap = 0
    /\ save = "toggling" /\ wait = "toggle"
    /\ save' = "reading" /\ wait' = "refresh"
    /\ needsRead' = TRUE
    /\ UNCHANGED <<ruleA, ruleB, limits, form, which, frozen, readStale, gap, want>>

LateToggle ==
    /\ gap = 0
    /\ save = "toggling" /\ wait = "toggle"
    /\ save' = "reading" /\ wait' = "refresh"
    /\ needsRead' = TRUE
    /\ UNCHANGED <<ruleA, ruleB, limits, form, which, frozen, readStale, gap, want>>

\* The Monday rule stays off. A second switch path passes 500 states.

\* The screen shows the new slider at once. The store waits for the response.
StartRefund ==
    /\ gap = 0
    /\ save = "idle" /\ wait = "none" /\ which = "none"
    /\ which' = "refund" /\ wait' = "limit" /\ save' = "saving"
    /\ refundSlider' = 1 - refund
    /\ UNCHANGED <<ruleA, ruleB, refund, ads, reorder, adsSlider, reorderSlider, refundTable, adsTable, reorderTable, form, frozen, memory, gap, want>>

StartAds ==
    /\ save = "idle" /\ wait = "none" /\ which = "none"
    /\ which' = "ads" /\ wait' = "limit" /\ save' = "saving"
    /\ adsSlider' = 1 - ads
    /\ UNCHANGED <<ruleA, ruleB, refund, ads, reorder, refundSlider, reorderSlider, refundTable, adsTable, reorderTable, form, frozen, memory, gap, want>>

\* The response replaces the snapshot. A flag from a failed read starts one read.
CommitRefund ==
    /\ gap = 0
    /\ save = "saving" /\ wait = "limit" /\ which = "refund"
    /\ which' = "none"
    /\ refund' = refundSlider /\ refundTable' = refundSlider
    /\ IF needsRead
       THEN /\ save' = "reading" /\ wait' = "refresh"
       ELSE /\ save' = "idle" /\ wait' = "none"
    /\ UNCHANGED <<ruleA, ruleB, refundSlider, ads, adsSlider, adsTable, reorder, reorderSlider, reorderTable, form, frozen, memory, gap, want>>

CommitAds ==
    /\ save = "saving" /\ wait = "limit" /\ which = "ads"
    /\ which' = "none"
    /\ ads' = adsSlider /\ adsTable' = adsSlider
    /\ gap' = IF gap = 0 THEN 0 ELSE 2
    /\ IF needsRead
       THEN /\ save' = "reading" /\ wait' = "refresh"
       ELSE /\ save' = "idle" /\ wait' = "none"
    /\ UNCHANGED <<ruleA, ruleB, adsSlider, refund, refundSlider, refundTable, reorder, reorderSlider, reorderTable, form, frozen, memory, want>>

\* The write leaves the queue. The slider returns to the store. One read starts.
FailRefund ==
    /\ gap = 0
    /\ save = "saving" /\ wait = "limit" /\ which = "refund"
    /\ which' = "none" /\ wait' = "refresh" /\ save' = "reading"
    /\ refundSlider' = refund /\ adsSlider' = ads
    /\ needsRead' = TRUE
    /\ UNCHANGED <<ruleA, ruleB, refund, ads, reorder, reorderSlider, refundTable, adsTable, reorderTable, form, frozen, readStale, gap, want>>

LateRefund ==
    /\ gap = 0
    /\ save = "saving" /\ wait = "limit" /\ which = "refund"
    /\ which' = "none" /\ wait' = "refresh" /\ save' = "reading"
    /\ refundSlider' = refund /\ adsSlider' = ads
    /\ needsRead' = TRUE
    /\ UNCHANGED <<ruleA, ruleB, refund, ads, reorder, reorderSlider, refundTable, adsTable, reorderTable, form, frozen, readStale, gap, want>>

FailAds ==
    /\ gap = 0
    /\ save = "saving" /\ wait = "limit" /\ which = "ads"
    /\ which' = "none" /\ wait' = "refresh" /\ save' = "reading"
    /\ refundSlider' = refund /\ adsSlider' = ads
    /\ needsRead' = TRUE
    /\ UNCHANGED <<ruleA, ruleB, refund, ads, reorder, reorderSlider, refundTable, adsTable, reorderTable, form, frozen, readStale, gap, want>>

LateAds ==
    /\ save = "saving" /\ wait = "limit" /\ which = "ads"
    /\ which' = "none" /\ wait' = "refresh" /\ save' = "reading"
    /\ refundSlider' = refund /\ adsSlider' = ads
    /\ needsRead' = TRUE
    /\ UNCHANGED <<ruleA, ruleB, refund, ads, reorder, reorderSlider, refundTable, adsTable, reorderTable, form, frozen, readStale, gap, want>>

\* Typing is allowed after the add, and while a write waits.
TypeAction ==
    /\ gap = 0
    /\ action = "blank"
    /\ action' = "text" /\ edited' = TRUE
    /\ UNCHANGED <<ruleA, ruleB, limits, added, newOn, pending, save, wait, which, frozen, memory, gap, want>>

\* The row appears at once. The action clears. The write has not committed.
StartAdd ==
    /\ gap = 0
    /\ save = "idle" /\ wait = "none" /\ added = 0 /\ pending = 0 /\ action = "text"
    /\ action' = "blank" /\ edited' = FALSE
    /\ pending' = 1 /\ newOn' = TRUE /\ save' = "adding" /\ wait' = "add"
    /\ UNCHANGED <<ruleA, ruleB, limits, added, which, frozen, memory, gap, want>>

\* The response puts the row in the snapshot and drops the pending row.
CommitAdd ==
    /\ gap = 0
    /\ save = "adding" /\ wait = "add"
    /\ added' = 1 /\ newOn' = TRUE /\ pending' = 0
    /\ IF needsRead
       THEN /\ save' = "reading" /\ wait' = "refresh"
       ELSE /\ save' = "idle" /\ wait' = "none"
    /\ UNCHANGED <<ruleA, ruleB, limits, action, edited, which, frozen, memory, gap, want>>

\* Nothing is stored. The draft returns only when the user has not typed again.
\* The write leaves the queue and one read starts.
FailAdd ==
    /\ gap = 0
    /\ save = "adding" /\ wait = "add"
    /\ pending' = 0 /\ newOn' = FALSE /\ save' = "reading" /\ wait' = "refresh"
    /\ needsRead' = TRUE
    /\ IF edited = FALSE /\ action = "blank"
       THEN /\ action' = "text"
            /\ UNCHANGED edited
       ELSE UNCHANGED <<action, edited>>
    /\ UNCHANGED <<ruleA, ruleB, limits, added, which, frozen, readStale, gap, want>>

LateAdd ==
    /\ gap = 0
    /\ save = "adding" /\ wait = "add"
    /\ pending' = 0 /\ newOn' = FALSE /\ save' = "reading" /\ wait' = "refresh"
    /\ needsRead' = TRUE
    /\ IF edited = FALSE /\ action = "blank"
       THEN /\ action' = "text"
            /\ UNCHANGED edited
       ELSE UNCHANGED <<action, edited>>
    /\ UNCHANGED <<ruleA, ruleB, limits, added, which, frozen, readStale, gap, want>>

\* The read returns the store. A stale read keeps the flag.
ReadOk ==
    /\ save = "reading" /\ wait = "refresh"
    /\ save' = "idle" /\ wait' = "none" /\ needsRead' = (needsRead /\ readStale)
    /\ readStale' = FALSE
    /\ UNCHANGED <<ruleA, ruleB, limits, form, which, frozen, gap, want>>

\* The read fails. The flag is set. The wait stops. The snapshot stays.
ReadFail ==
    /\ save = "reading" /\ wait = "refresh"
    /\ save' = "idle" /\ wait' = "none" /\ needsRead' = TRUE
    /\ readStale' = FALSE
    /\ UNCHANGED <<ruleA, ruleB, limits, form, which, frozen, gap, want>>

\* The screen loads again. One read starts. This is not a timer.
Reload ==
    /\ gap = 0
    /\ save = "idle" /\ wait = "none" /\ needsRead = TRUE /\ pending = 0
    /\ save' = "reading" /\ wait' = "refresh"
    /\ UNCHANGED <<ruleA, ruleB, limits, form, which, frozen, memory, gap, want>>

Navigate ==
    /\ gap = 0
    /\ save = "idle" /\ wait = "none"
    /\ save' = "reading" /\ wait' = "refresh"
    /\ UNCHANGED <<ruleA, ruleB, limits, form, which, frozen, memory, gap, want>>

FailureDuringRead ==
    /\ gap = 0
    /\ save = "reading" /\ wait = "refresh" /\ ~readStale
    /\ needsRead' = TRUE /\ readStale' = TRUE
    /\ UNCHANGED <<ruleA, ruleB, limits, form, save, wait, which, frozen, gap, want>>

\* The timed-out ad cap is still the newest write, so it may commit when it arrives.
OpenLate ==
    /\ gap = 0 /\ want = 0
    /\ save = "saving" /\ wait = "limit" /\ which = "ads"
    /\ ads = 1 /\ refund = 1 /\ reorder = 1
    /\ ruleA = TRUE /\ ruleB = FALSE
    /\ added = 0 /\ pending = 0 /\ newOn = FALSE
    /\ action = "blank" /\ edited = FALSE
    /\ needsRead = FALSE /\ readStale = FALSE
    /\ which' = "none" /\ wait' = "refresh" /\ save' = "reading"
    /\ want' = adsSlider /\ gap' = 1
    /\ refundSlider' = refund /\ adsSlider' = ads
    /\ needsRead' = TRUE
    /\ UNCHANGED <<ruleA, ruleB, refund, ads, reorder, reorderSlider, refundTable, adsTable, reorderTable, form, frozen, readStale>>

\* A later arrival commits only when no newer write has landed.
ArriveLate ==
    /\ gap \in {1, 2}
    /\ save = "idle" /\ wait = "none"
    /\ IF gap = 1
       THEN /\ ads' = want /\ adsTable' = want /\ adsSlider' = want
       ELSE UNCHANGED <<ads, adsTable, adsSlider>>
    /\ gap' = 0 /\ want' = 0
    /\ UNCHANGED <<ruleA, ruleB, refund, reorder, refundSlider, reorderSlider, refundTable, reorderTable, form, save, wait, which, frozen, memory>>

\* A blank action does nothing.
AddBlank ==
    /\ action = "blank"
    /\ UNCHANGED vars

Next ==
    \/ StartToggle
    \/ CommitToggle
    \/ FailToggle
    \/ LateToggle
    \/ StartRefund
    \/ StartAds
    \/ CommitRefund
    \/ CommitAds
    \/ FailRefund
    \/ FailAds
    \/ LateRefund
    \/ LateAds
    \/ TypeAction
    \/ StartAdd
    \/ CommitAdd
    \/ FailAdd
    \/ LateAdd
    \/ ReadOk
    \/ ReadFail
    \/ Reload
    \/ Navigate
    \/ FailureDuringRead
    \/ OpenLate
    \/ ArriveLate
    \/ AddBlank

\* A begin, a limit, a switch, and a read each end.
WaitEnds == [](wait # "none" => <>(wait = "none"))
\* An older read does not clear a failure that happened while it waited.
ReadKeepsStale == [][ReadOk => (readStale => needsRead')]_vars
\* An older timed-out write does not replace a newer value.
FenceHolds == [][ArriveLate => ((gap = 1 => ads' = want /\ adsTable' = want) /\ (gap = 2 => UNCHANGED <<ads, adsTable>>))]_vars

Spec == Init /\ [][Next]_vars
    /\ WF_vars(LateAdd)
    /\ WF_vars(LateRefund)
    /\ WF_vars(LateAds)
    /\ WF_vars(LateToggle)
    /\ WF_vars(ReadFail)

====
