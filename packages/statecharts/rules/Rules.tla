---- MODULE Rules ----
\* A slider and the traffic table read one policy value.
\* A rule switch changes only that rule.
\* A blank action adds no rule. A new rule is on, and only the action clears.
\* A later change does not change an existing Mandate.
\* A limit change writes no event.
\* # model: packages/domain/src/policy/rule-commands.ts
\* # model: packages/adapters/src/neon/commands/rules.ts
\* # model: packages/kernel/src/plugins/policy-rules.ts
\* # model: apps/web/src/screens/rules/screen.tsx
\* # model: apps/web/src/server/rules.ts

EXTENDS Integers

VARIABLES
    ruleA, ruleB,
    refund, ads, reorder,
    refundSlider, refundTable,
    adsSlider, adsTable,
    reorderSlider, reorderTable,
    action, added, newOn,
    mandate, events,
    textA, textB

vars == <<
    ruleA, ruleB,
    refund, ads, reorder,
    refundSlider, refundTable,
    adsSlider, adsTable,
    reorderSlider, reorderTable,
    action, added, newOn,
    mandate, events,
    textA, textB
>>

Bits == {0, 1}
ActionText == {"blank", "text"}

TypeOK ==
    /\ ruleA \in BOOLEAN
    /\ ruleB \in BOOLEAN
    /\ refund \in Bits /\ ads \in Bits /\ reorder \in Bits
    /\ refundSlider \in Bits /\ refundTable \in Bits
    /\ adsSlider \in Bits /\ adsTable \in Bits
    /\ reorderSlider \in Bits /\ reorderTable \in Bits
    /\ action \in ActionText
    /\ added \in Bits
    /\ newOn \in BOOLEAN
    /\ mandate = "frozen"
    /\ events = 0
    /\ textA = "refund"
    /\ textB = "monday"

\* The slider, the traffic table, and the stored policy key are the same value.
SamePolicy ==
    /\ refundSlider = refund /\ refundTable = refund
    /\ adsSlider = ads /\ adsTable = ads
    /\ reorderSlider = reorder /\ reorderTable = reorder

MandateFrozen == mandate = "frozen"
NoLimitEvent == events = 0
NewRuleOn == (added = 1 => newOn = TRUE)
NoRuleYet == (added = 0 => newOn = FALSE)
OnlyActionClears == (added = 1 => action = "blank")
RuleText == textA = "refund" /\ textB = "monday"

limits == <<refund, ads, reorder, refundSlider, refundTable, adsSlider, adsTable, reorderSlider, reorderTable>>
rest == <<action, added, newOn, mandate, events, textA, textB>>

Init ==
    /\ ruleA = TRUE /\ ruleB = FALSE
    /\ refund = 1 /\ ads = 1 /\ reorder = 1
    /\ refundSlider = 1 /\ refundTable = 1
    /\ adsSlider = 1 /\ adsTable = 1
    /\ reorderSlider = 1 /\ reorderTable = 1
    /\ action = "blank" /\ added = 0 /\ newOn = FALSE
    /\ mandate = "frozen" /\ events = 0
    /\ textA = "refund" /\ textB = "monday"

ToggleA ==
    /\ ruleA' = ~ruleA
    /\ UNCHANGED <<ruleB, limits, rest>>

ToggleB ==
    /\ ruleB' = ~ruleB
    /\ UNCHANGED <<ruleA, limits, rest>>

SetRefund ==
    /\ refund' = 1 - refund
    /\ refundSlider' = refund'
    /\ refundTable' = refund'
    /\ UNCHANGED <<ruleA, ruleB, ads, reorder, adsSlider, adsTable, reorderSlider, reorderTable, rest>>

SetAds ==
    /\ ads' = 1 - ads
    /\ adsSlider' = ads'
    /\ adsTable' = ads'
    /\ UNCHANGED <<ruleA, ruleB, refund, reorder, refundSlider, refundTable, reorderSlider, reorderTable, rest>>

SetReorder ==
    /\ reorder' = 1 - reorder
    /\ reorderSlider' = reorder'
    /\ reorderTable' = reorder'
    /\ UNCHANGED <<ruleA, ruleB, refund, ads, refundSlider, refundTable, adsSlider, adsTable, rest>>

\* The model allows one typed action, then one add. The code allows another type after the add.
TypeAction ==
    /\ action = "blank" /\ added = 0
    /\ action' = "text"
    /\ UNCHANGED <<ruleA, ruleB, limits, added, newOn, mandate, events, textA, textB>>

Add ==
    /\ action = "text" /\ added = 0
    /\ added' = 1 /\ newOn' = TRUE /\ action' = "blank"
    /\ UNCHANGED <<ruleA, ruleB, limits, mandate, events, textA, textB>>

\* A blank action does nothing.
AddBlank ==
    /\ action = "blank"
    /\ UNCHANGED vars

Next ==
    \/ ToggleA
    \/ ToggleB
    \/ SetRefund
    \/ SetAds
    \/ SetReorder
    \/ TypeAction
    \/ Add
    \/ AddBlank

Spec == Init /\ [][Next]_vars

====
