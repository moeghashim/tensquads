---- MODULE Rules ----
\* The screen shows the snapshot plus a pending row.
\* The snapshot changes only when a write response or a read arrives.
\* A write response returns the row and replaces it. A late write commits nothing.
\* A failed or late write leaves the queue. One read then refreshes the snapshot.
\* A failed read stops the wait. The next action reads again.
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
\* # model: apps/web/src/screens/rules/write-queue.ts
\* # model: apps/web/src/server/rules.ts

EXTENDS Integers

VARIABLES
    ruleA, ruleB,
    refund, ads, reorder,
    refundSlider, adsSlider, reorderSlider,
    refundTable, adsTable, reorderTable,
    action, edited, added, newOn, pending,
    save, wait, which,
    mandate, events,
    textA, textB

vars == <<
    ruleA, ruleB,
    refund, ads, reorder,
    refundSlider, adsSlider, reorderSlider,
    refundTable, adsTable, reorderTable,
    action, edited, added, newOn, pending,
    save, wait, which,
    mandate, events,
    textA, textB
>>

Bits == {0, 1}
ActionText == {"blank", "text"}
Saves == {"idle", "adding", "reading", "saving"}
Waits == {"none", "add", "limit", "refresh"}
Limits == {"none", "refund", "ads"}

TypeOK ==
    /\ ruleA \in BOOLEAN /\ ruleB \in BOOLEAN
    /\ refund \in Bits /\ ads \in Bits /\ reorder \in Bits
    /\ refundSlider \in Bits /\ adsSlider \in Bits /\ reorderSlider \in Bits
    /\ refundTable \in Bits /\ adsTable \in Bits /\ reorderTable \in Bits
    /\ action \in ActionText /\ edited \in BOOLEAN
    /\ added \in Bits /\ newOn \in BOOLEAN /\ pending \in Bits
    /\ save \in Saves /\ wait \in Waits /\ which \in Limits
    /\ mandate = "frozen" /\ events = 0
    /\ textA = "refund" /\ textB = "monday"

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
    /\ save = "adding" => pending = 1 /\ added = 0 /\ which = "none"
    /\ save = "reading" => which = "none" /\ pending = 0
    /\ save = "idle" => pending = 0 /\ which = "none"
    /\ save = "saving" => which \in {"refund", "ads"}

MandateFrozen == mandate = "frozen"
NoLimitEvent == events = 0
NewRuleOn == (added = 1 => newOn = TRUE)
NoRuleYet == (added = 0 => newOn = FALSE)
\* The add clears the action. A second edit may type it again.
AddClearsAction == (added = 1 /\ edited = FALSE) => action = "blank"
RuleText == textA = "refund" /\ textB = "monday"

limits == <<
    refund, ads, reorder,
    refundSlider, adsSlider, reorderSlider,
    refundTable, adsTable, reorderTable
>>
form == <<action, edited, added, newOn, pending>>
frozen == <<mandate, events, textA, textB>>

Init ==
    /\ ruleA = TRUE /\ ruleB = FALSE
    /\ refund = 1 /\ ads = 1 /\ reorder = 1
    /\ refundSlider = 1 /\ adsSlider = 1 /\ reorderSlider = 1
    /\ refundTable = 1 /\ adsTable = 1 /\ reorderTable = 1
    /\ action = "blank" /\ edited = FALSE
    /\ added = 0 /\ newOn = FALSE /\ pending = 0
    /\ save = "idle" /\ wait = "none" /\ which = "none"
    /\ mandate = "frozen" /\ events = 0
    /\ textA = "refund" /\ textB = "monday"

ToggleA ==
    /\ ruleA' = ~ruleA
    /\ UNCHANGED <<ruleB, limits, form, save, wait, which, frozen>>

ToggleB ==
    /\ ruleB' = ~ruleB
    /\ UNCHANGED <<ruleA, limits, form, save, wait, which, frozen>>

\* The screen shows the new slider at once. The store waits for the response.
StartRefund ==
    /\ save = "idle" /\ wait = "none" /\ which = "none"
    /\ which' = "refund" /\ wait' = "limit" /\ save' = "saving"
    /\ refundSlider' = 1 - refund
    /\ UNCHANGED <<ruleA, ruleB, refund, ads, reorder, adsSlider, reorderSlider, refundTable, adsTable, reorderTable, form, frozen>>

StartAds ==
    /\ save = "idle" /\ wait = "none" /\ which = "none"
    /\ which' = "ads" /\ wait' = "limit" /\ save' = "saving"
    /\ adsSlider' = 1 - ads
    /\ UNCHANGED <<ruleA, ruleB, refund, ads, reorder, refundSlider, reorderSlider, refundTable, adsTable, reorderTable, form, frozen>>

\* The response replaces the snapshot. The wait ends. No second read.
CommitRefund ==
    /\ save = "saving" /\ wait = "limit" /\ which = "refund"
    /\ which' = "none" /\ wait' = "none" /\ save' = "idle"
    /\ refund' = refundSlider /\ refundTable' = refundSlider
    /\ UNCHANGED <<ruleA, ruleB, refundSlider, ads, adsSlider, adsTable, reorder, reorderSlider, reorderTable, form, frozen>>

CommitAds ==
    /\ save = "saving" /\ wait = "limit" /\ which = "ads"
    /\ which' = "none" /\ wait' = "none" /\ save' = "idle"
    /\ ads' = adsSlider /\ adsTable' = adsSlider
    /\ UNCHANGED <<ruleA, ruleB, adsSlider, refund, refundSlider, refundTable, reorder, reorderSlider, reorderTable, form, frozen>>

\* The write leaves the queue. The slider returns to the store. One read starts.
FailRefund ==
    /\ save = "saving" /\ wait = "limit" /\ which = "refund"
    /\ which' = "none" /\ wait' = "refresh" /\ save' = "reading"
    /\ refundSlider' = refund /\ adsSlider' = ads
    /\ UNCHANGED <<ruleA, ruleB, refund, ads, reorder, reorderSlider, refundTable, adsTable, reorderTable, form, frozen>>

LateRefund ==
    /\ save = "saving" /\ wait = "limit" /\ which = "refund"
    /\ which' = "none" /\ wait' = "refresh" /\ save' = "reading"
    /\ refundSlider' = refund /\ adsSlider' = ads
    /\ UNCHANGED <<ruleA, ruleB, refund, ads, reorder, reorderSlider, refundTable, adsTable, reorderTable, form, frozen>>

FailAds ==
    /\ save = "saving" /\ wait = "limit" /\ which = "ads"
    /\ which' = "none" /\ wait' = "refresh" /\ save' = "reading"
    /\ refundSlider' = refund /\ adsSlider' = ads
    /\ UNCHANGED <<ruleA, ruleB, refund, ads, reorder, reorderSlider, refundTable, adsTable, reorderTable, form, frozen>>

LateAds ==
    /\ save = "saving" /\ wait = "limit" /\ which = "ads"
    /\ which' = "none" /\ wait' = "refresh" /\ save' = "reading"
    /\ refundSlider' = refund /\ adsSlider' = ads
    /\ UNCHANGED <<ruleA, ruleB, refund, ads, reorder, reorderSlider, refundTable, adsTable, reorderTable, form, frozen>>

\* Typing is allowed after the add, and while a write waits.
TypeAction ==
    /\ action = "blank"
    /\ action' = "text" /\ edited' = TRUE
    /\ UNCHANGED <<ruleA, ruleB, limits, added, newOn, pending, save, wait, which, frozen>>

\* The row appears at once. The action clears. The write has not committed.
StartAdd ==
    /\ save = "idle" /\ wait = "none" /\ added = 0 /\ pending = 0 /\ action = "text"
    /\ action' = "blank" /\ edited' = FALSE
    /\ pending' = 1 /\ save' = "adding" /\ wait' = "add"
    /\ UNCHANGED <<ruleA, ruleB, limits, added, newOn, which, frozen>>

\* The response puts the row in the snapshot and drops the pending row.
CommitAdd ==
    /\ save = "adding" /\ wait = "add"
    /\ added' = 1 /\ newOn' = TRUE /\ pending' = 0
    /\ save' = "idle" /\ wait' = "none"
    /\ UNCHANGED <<ruleA, ruleB, limits, action, edited, which, frozen>>

\* Nothing is stored. The draft returns only when the user has not typed again.
\* The write leaves the queue and one read starts.
FailAdd ==
    /\ save = "adding" /\ wait = "add"
    /\ pending' = 0 /\ save' = "reading" /\ wait' = "refresh"
    /\ IF edited = FALSE /\ action = "blank"
       THEN /\ action' = "text"
            /\ UNCHANGED edited
       ELSE UNCHANGED <<action, edited>>
    /\ UNCHANGED <<ruleA, ruleB, limits, added, newOn, which, frozen>>

LateAdd ==
    /\ save = "adding" /\ wait = "add"
    /\ pending' = 0 /\ save' = "reading" /\ wait' = "refresh"
    /\ IF edited = FALSE /\ action = "blank"
       THEN /\ action' = "text"
            /\ UNCHANGED edited
       ELSE UNCHANGED <<action, edited>>
    /\ UNCHANGED <<ruleA, ruleB, limits, added, newOn, which, frozen>>

\* The read returns the store. The snapshot stays, because the failed write stored nothing.
ReadOk ==
    /\ save = "reading" /\ wait = "refresh"
    /\ save' = "idle" /\ wait' = "none"
    /\ UNCHANGED <<ruleA, ruleB, limits, form, which, frozen>>

\* The read fails. The wait stops. The snapshot stays. The next action reads again.
ReadFail ==
    /\ save = "reading" /\ wait = "refresh"
    /\ save' = "idle" /\ wait' = "none"
    /\ UNCHANGED <<ruleA, ruleB, limits, form, which, frozen>>

\* A blank action does nothing.
AddBlank ==
    /\ action = "blank"
    /\ UNCHANGED vars

EndAdd == CommitAdd \/ FailAdd \/ LateAdd
EndLimit == CommitRefund \/ CommitAds \/ FailRefund \/ FailAds \/ LateRefund \/ LateAds
\* The one read ends on a response or a failure. It is enabled only while that read waits.
FinishRefresh == ReadOk \/ ReadFail

Next ==
    \/ ToggleA
    \/ ToggleB
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
    \/ AddBlank

\* A begin, a limit, and a read each end.
WaitEnds == [](wait # "none" => <>(wait = "none"))

Spec == Init /\ [][Next]_vars
    /\ WF_vars(EndAdd) /\ WF_vars(EndLimit) /\ WF_vars(FinishRefresh)

====
