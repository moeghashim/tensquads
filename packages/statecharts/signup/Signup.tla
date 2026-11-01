---- MODULE Signup ----
\* Sign-up moves from the business type to a created account.
\* # model: apps/web/src/screens/signup/machine.ts
\* Onboarding.dc.html starts at Business type.
\* A new business pre-selects three squads. An existing business pre-selects four.
\* Zero squads blocks the account form. Back goes one step.
\* Submit starts the request. Create stores the first account.
\* FindExisting is the retry and does not store a second account.
\* A failed response or a failed navigation leaves the account form in place.

EXTENDS Integers

VARIABLES step, kind, picked, preset, toggled, accounts, phase
vars == <<step, kind, picked, preset, toggled, accounts, phase>>

Steps == {"type", "details", "squad", "account", "created"}
Kinds == {"none", "new", "existing"}
Phases == {"idle", "request", "stored", "failed", "open"}

TypeOK ==
    /\ step \in Steps
    /\ kind \in Kinds
    /\ picked \in {0, 3, 4}
    /\ preset \in {0, 3, 4}
    /\ toggled \in BOOLEAN
    /\ accounts \in {0, 1}
    /\ phase \in Phases

PresetHolds == toggled = FALSE => picked = preset

AccountNeedsSquad == step \in {"account", "created"} => picked > 0

CreatedHasAccount == step = "created" => accounts = 1 /\ phase = "open"

AccountFlow ==
    /\ phase = "stored" => accounts = 1 /\ step = "account"
    /\ phase = "open" => step = "created" /\ accounts = 1
    /\ phase = "request" => step = "account"
    /\ phase = "failed" => step = "account"
    /\ step \in {"type", "details", "squad"} => phase = "idle"

KindAfterType == step # "type" => kind \in {"new", "existing"}

Init ==
    /\ step = "type"
    /\ kind = "none"
    /\ picked = 0
    /\ preset = 0
    /\ toggled = FALSE
    /\ accounts = 0
    /\ phase = "idle"

PickNew ==
    /\ step = "type"
    /\ step' = "details"
    /\ kind' = "new"
    /\ picked' = 3
    /\ preset' = 3
    /\ toggled' = FALSE
    /\ UNCHANGED <<accounts, phase>>

PickExisting ==
    /\ step = "type"
    /\ step' = "details"
    /\ kind' = "existing"
    /\ picked' = 4
    /\ preset' = 4
    /\ toggled' = FALSE
    /\ UNCHANGED <<accounts, phase>>

Back ==
    /\ \/ /\ step = "details"
         /\ step' = "type"
         /\ UNCHANGED phase
       \/ /\ step = "squad"
         /\ step' = "details"
         /\ UNCHANGED phase
       \/ /\ step = "account"
         /\ phase \in {"idle", "failed"}
         /\ step' = "squad"
         /\ phase' = "idle"
    /\ UNCHANGED <<kind, picked, preset, toggled, accounts>>

ChooseSquads ==
    /\ step = "details"
    /\ step' = "squad"
    /\ UNCHANGED <<kind, picked, preset, toggled, accounts, phase>>

OpenAccount ==
    /\ step = "squad"
    /\ picked > 0
    /\ step' = "account"
    /\ UNCHANGED <<kind, picked, preset, toggled, accounts, phase>>

Submit ==
    /\ step = "account"
    /\ phase \in {"idle", "failed"}
    /\ phase' = "request"
    /\ UNCHANGED <<step, kind, picked, preset, toggled, accounts>>

Create ==
    /\ phase = "request"
    /\ accounts = 0
    /\ accounts' = 1
    /\ phase' = "stored"
    /\ UNCHANGED <<step, kind, picked, preset, toggled>>

FindExisting ==
    /\ phase = "request"
    /\ accounts = 1
    /\ phase' = "stored"
    /\ UNCHANGED <<step, kind, picked, preset, toggled, accounts>>

FailResponse ==
    /\ phase = "request"
    /\ phase' = "failed"
    /\ UNCHANGED <<step, kind, picked, preset, toggled, accounts>>

Navigate ==
    /\ phase = "stored"
    /\ step' = "created"
    /\ phase' = "open"
    /\ UNCHANGED <<kind, picked, preset, toggled, accounts>>

FailNavigation ==
    /\ phase = "stored"
    /\ accounts = 1
    /\ phase' = "failed"
    /\ UNCHANGED <<step, kind, picked, preset, toggled, accounts>>

ToggleOff ==
    /\ step = "squad"
    /\ toggled = FALSE
    /\ picked > 0
    /\ picked' = 0
    /\ toggled' = TRUE
    /\ UNCHANGED <<step, kind, preset, accounts, phase>>

ToggleOn ==
    /\ step = "squad"
    /\ toggled = TRUE
    /\ picked' = preset
    /\ toggled' = FALSE
    /\ UNCHANGED <<step, kind, preset, accounts, phase>>

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
    \/ Create
    \/ FindExisting
    \/ FailResponse
    \/ Navigate
    \/ FailNavigation
    \/ ToggleOff
    \/ ToggleOn
    \/ Stay

Spec == Init /\ [][Next]_vars

====
