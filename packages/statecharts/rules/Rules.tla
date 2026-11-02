---- MODULE Rules ----
\* A rule switch changes only that rule.
\* A slider may differ from the stored limit only while that limit's write waits.
\* The traffic table is the stored value. A late write commits nothing.
\* A blank action adds no rule. A new rule is on. The add clears the action.
\* A later keystroke can type an action again. A second edit does not clear it.
\* One write waits at a time. The wait is bounded and it ends.
\* A saved row stays until a later read confirms it.
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
Saves == {"idle", "adding", "reading", "stays", "saving"}
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
    /\ wait = "none" <=> save \in {"idle", "stays"}
    /\ wait = "add" <=> save = "adding"
    /\ wait = "limit" <=> save = "saving"
    /\ wait = "refresh" <=> save = "reading"
    /\ save = "adding" => pending = 1 /\ added = 0 /\ which = "none"
    /\ save = "reading" => pending = 1 /\ added = 1 /\ newOn = TRUE /\ which = "none"
    /\ save = "stays" => pending = 1 /\ added = 1 /\ newOn = TRUE
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

\* Back to the save that was waiting. A hung read returns to the saved row.
Restore == IF pending = 1 /\ added = 1 THEN "stays" ELSE "idle"

\* The screen shows the new slider at once. The store waits for the commit.
StartRefund ==
    /\ save \in {"idle", "stays"} /\ wait = "none" /\ which = "none"
    /\ which' = "refund" /\ wait' = "limit" /\ save' = "saving"
    /\ refundSlider' = 1 - refund
    /\ UNCHANGED <<ruleA, ruleB, refund, ads, reorder, adsSlider, reorderSlider, refundTable, adsTable, reorderTable, form, frozen>>

StartAds ==
    /\ save \in {"idle", "stays"} /\ wait = "none" /\ which = "none"
    /\ which' = "ads" /\ wait' = "limit" /\ save' = "saving"
    /\ adsSlider' = 1 - ads
    /\ UNCHANGED <<ruleA, ruleB, refund, ads, reorder, refundSlider, reorderSlider, refundTable, adsTable, reorderTable, form, frozen>>

CommitRefund ==
    /\ save = "saving" /\ wait = "limit" /\ which = "refund"
    /\ which' = "none" /\ wait' = "none" /\ save' = Restore
    /\ refund' = refundSlider /\ refundTable' = refundSlider
    /\ UNCHANGED <<ruleA, ruleB, refundSlider, ads, adsSlider, adsTable, reorder, reorderSlider, reorderTable, form, frozen>>

CommitAds ==
    /\ save = "saving" /\ wait = "limit" /\ which = "ads"
    /\ which' = "none" /\ wait' = "none" /\ save' = Restore
    /\ ads' = adsSlider /\ adsTable' = adsSlider
    /\ UNCHANGED <<ruleA, ruleB, adsSlider, refund, refundSlider, refundTable, reorder, reorderSlider, reorderTable, form, frozen>>

\* A failed or late write stores nothing. The slider returns to the store.
FailRefund ==
    /\ save = "saving" /\ wait = "limit" /\ which = "refund"
    /\ which' = "none" /\ wait' = "none" /\ save' = Restore
    /\ refundSlider' = refund /\ adsSlider' = ads
    /\ UNCHANGED <<ruleA, ruleB, refund, ads, reorder, reorderSlider, refundTable, adsTable, reorderTable, form, frozen>>

LateRefund ==
    /\ save = "saving" /\ wait = "limit" /\ which = "refund"
    /\ which' = "none" /\ wait' = "none" /\ save' = Restore
    /\ refundSlider' = refund /\ adsSlider' = ads
    /\ UNCHANGED <<ruleA, ruleB, refund, ads, reorder, reorderSlider, refundTable, adsTable, reorderTable, form, frozen>>

FailAds ==
    /\ save = "saving" /\ wait = "limit" /\ which = "ads"
    /\ which' = "none" /\ wait' = "none" /\ save' = Restore
    /\ refundSlider' = refund /\ adsSlider' = ads
    /\ UNCHANGED <<ruleA, ruleB, refund, ads, reorder, reorderSlider, refundTable, adsTable, reorderTable, form, frozen>>

LateAds ==
    /\ save = "saving" /\ wait = "limit" /\ which = "ads"
    /\ which' = "none" /\ wait' = "none" /\ save' = Restore
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

CommitAdd ==
    /\ save = "adding" /\ wait = "add"
    /\ added' = 1 /\ newOn' = TRUE
    /\ save' = "reading" /\ wait' = "refresh"
    /\ UNCHANGED <<ruleA, ruleB, limits, action, edited, pending, which, frozen>>

\* Nothing is stored. The draft returns only when the user has not typed again.
FailAdd ==
    /\ save = "adding" /\ wait = "add"
    /\ pending' = 0 /\ save' = "idle" /\ wait' = "none"
    /\ IF edited = FALSE /\ action = "blank"
       THEN /\ action' = "text"
            /\ UNCHANGED edited
       ELSE UNCHANGED <<action, edited>>
    /\ UNCHANGED <<ruleA, ruleB, limits, added, newOn, which, frozen>>

LateAdd ==
    /\ save = "adding" /\ wait = "add"
    /\ pending' = 0 /\ save' = "idle" /\ wait' = "none"
    /\ IF edited = FALSE /\ action = "blank"
       THEN /\ action' = "text"
            /\ UNCHANGED edited
       ELSE UNCHANGED <<action, edited>>
    /\ UNCHANGED <<ruleA, ruleB, limits, added, newOn, which, frozen>>

\* The read timed out. The saved row stays on the screen.
RefreshTimeout ==
    /\ save = "reading" /\ wait = "refresh"
    /\ save' = "stays" /\ wait' = "none"
    /\ UNCHANGED <<ruleA, ruleB, limits, form, which, frozen>>

\* A server read confirms the row. This also ends a row that stayed after a hung read.
LaterRead ==
    /\ save \in {"reading", "stays"} /\ pending = 1 /\ added = 1
    /\ pending' = 0 /\ save' = "idle" /\ wait' = "none"
    /\ UNCHANGED <<ruleA, ruleB, limits, action, edited, added, newOn, which, frozen>>

\* A blank action does nothing.
AddBlank ==
    /\ action = "blank"
    /\ UNCHANGED vars

EndAdd == CommitAdd \/ FailAdd \/ LateAdd
EndLimit == CommitRefund \/ CommitAds \/ FailRefund \/ FailAds \/ LateRefund \/ LateAds
\* The read's own deadline. A row that already stayed is not forced to leave.
FinishRefresh == RefreshTimeout \/ (LaterRead /\ save = "reading")

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
    \/ RefreshTimeout
    \/ LaterRead
    \/ AddBlank

\* A begin, a limit, and a refresh each end. A saved row may stay.
WaitEnds == [](wait # "none" => <>(wait = "none"))

Spec == Init /\ [][Next]_vars
    /\ WF_vars(EndAdd) /\ WF_vars(EndLimit) /\ WF_vars(FinishRefresh)

====
