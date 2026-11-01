---- MODULE Signup ----
\* Sign-up moves from the business type to a created account.
\* # model: apps/web/src/screens/signup/machine.ts
\* Onboarding.dc.html starts at Business type.
\* A new business pre-selects three squads. An existing business pre-selects four.
\* Zero squads blocks the account form. Back goes one step.

EXTENDS Integers

VARIABLES step, kind, picked, preset, toggled, accounts
vars == <<step, kind, picked, preset, toggled, accounts>>

Steps == {"type", "details", "squad", "account", "created"}
Kinds == {"none", "new", "existing"}

TypeOK ==
    /\ step \in Steps
    /\ kind \in Kinds
    /\ picked \in {0, 3, 4}
    /\ preset \in {0, 3, 4}
    /\ toggled \in BOOLEAN
    /\ accounts \in {0, 1}

PresetHolds == toggled = FALSE => picked = preset

AccountNeedsSquad == step \in {"account", "created"} => picked > 0

CreatedHasAccount == step = "created" => accounts = 1

OpenHasNoAccount == step # "created" => accounts = 0

KindAfterType == step # "type" => kind \in {"new", "existing"}

Init ==
    /\ step = "type"
    /\ kind = "none"
    /\ picked = 0
    /\ preset = 0
    /\ toggled = FALSE
    /\ accounts = 0

PickNew ==
    /\ step = "type"
    /\ step' = "details"
    /\ kind' = "new"
    /\ picked' = 3
    /\ preset' = 3
    /\ toggled' = FALSE
    /\ UNCHANGED accounts

PickExisting ==
    /\ step = "type"
    /\ step' = "details"
    /\ kind' = "existing"
    /\ picked' = 4
    /\ preset' = 4
    /\ toggled' = FALSE
    /\ UNCHANGED accounts

Back ==
    /\ \/ /\ step = "details"
         /\ step' = "type"
       \/ /\ step = "squad"
         /\ step' = "details"
       \/ /\ step = "account"
         /\ step' = "squad"
    /\ UNCHANGED <<kind, picked, preset, toggled, accounts>>

ChooseSquads ==
    /\ step = "details"
    /\ step' = "squad"
    /\ UNCHANGED <<kind, picked, preset, toggled, accounts>>

OpenAccount ==
    /\ step = "squad"
    /\ picked > 0
    /\ step' = "account"
    /\ UNCHANGED <<kind, picked, preset, toggled, accounts>>

Submit ==
    /\ step = "account"
    /\ step' = "created"
    /\ accounts' = 1
    /\ UNCHANGED <<kind, picked, preset, toggled>>

ToggleOff ==
    /\ step = "squad"
    /\ toggled = FALSE
    /\ picked > 0
    /\ picked' = 0
    /\ toggled' = TRUE
    /\ UNCHANGED <<step, kind, preset, accounts>>

ToggleOn ==
    /\ step = "squad"
    /\ toggled = TRUE
    /\ picked' = preset
    /\ toggled' = FALSE
    /\ UNCHANGED <<step, kind, preset, accounts>>

Stay ==
    /\ step = "created"
    /\ UNCHANGED vars

Next ==
    \/ PickNew
    \/ PickExisting
    \/ Back
    \/ ChooseSquads
    \/ OpenAccount
    \/ Submit
    \/ ToggleOff
    \/ ToggleOn
    \/ Stay

Spec == Init /\ [][Next]_vars

====
