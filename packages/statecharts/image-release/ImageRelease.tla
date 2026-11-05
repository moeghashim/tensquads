---- MODULE ImageRelease ----
\* Image release moves among Draft, Beta, Stable, and Needs attention.
\* # model: packages/domain/src/catalog/image-view.ts
\* The attention badge equals the count of Needs attention images.
\* On latest is the rounded percent of deployed accounts, or not deployed when deployed is 0.
\* The sentence "22 of 34 (65%)" is the unit test. This model keeps the numbers that sentence is built from.
\* Roll out does nothing in version 1. The chart hides that step.
\* An update never changes limits, rules, autonomy, or keys.
\* A rollout stops after two failed health checks.
\* When no rollout is running, every account runs the same version.
\* That version is the stable version.
\* Stable and Needs attention move both ways. The status is not derived from bugs.
\* One image and two accounts keep the chart small.

EXTENDS Integers

CONSTANT Accounts

VARIABLES
    status, deployed, onLatest, badge, shown,
    rollout, fails, stableVersion, version,
    limits, rules, autonomy, keys

vars == <<status, deployed, onLatest, badge, shown, rollout, fails, stableVersion, version, limits, rules, autonomy, keys>>

Statuses == {"Draft", "Beta", "Stable", "Needs attention"}
Versions == 1..2

\* shown is -1 when nothing is deployed. Otherwise it is round(onLatest / deployed * 100).
Percent(d, n) == IF d = 0 THEN -1 ELSE (n * 100) \div d
Attention == IF status = "Needs attention" THEN 1 ELSE 0
Candidate == 3 - stableVersion
SameVersion == \A account \in Accounts : version[account] = stableVersion

TypeOK ==
    /\ status \in Statuses
    /\ deployed \in 0..2
    /\ onLatest \in 0..deployed
    /\ badge \in {0, 1}
    /\ shown = Percent(deployed, onLatest)
    /\ rollout \in {"idle", "running"}
    /\ fails \in 0..2
    /\ stableVersion \in Versions
    /\ version \in [Accounts -> Versions]
    /\ limits = 50
    /\ rules = 1
    /\ autonomy = 1
    /\ keys = 1

AttentionBadge == badge = Attention
OnLatestShown == shown = Percent(deployed, onLatest)
UpdateKeeps == limits = 50 /\ rules = 1 /\ autonomy = 1 /\ keys = 1
RolloutIdleSameVersion == rollout = "idle" => SameVersion
StopsAtTwo ==
    /\ fails \in 0..2
    /\ (fails = 2 => rollout = "idle" /\ SameVersion)
    /\ (fails = 1 => rollout = "running")

NextStatus(current) ==
    CASE current = "Draft" -> {"Beta"}
      [] current = "Beta" -> {"Draft", "Stable"}
      [] current = "Stable" -> {"Beta", "Needs attention"}
      [] current = "Needs attention" -> {"Stable"}

Init ==
    /\ status = "Stable"
    /\ deployed = 1
    /\ onLatest = 1
    /\ badge = 0
    /\ shown = Percent(1, 1)
    /\ rollout = "idle"
    /\ fails = 0
    /\ stableVersion = 1
    /\ version = [account \in Accounts |-> 1]
    /\ limits = 50
    /\ rules = 1
    /\ autonomy = 1
    /\ keys = 1

SetStatus ==
    /\ \E next \in NextStatus(status) :
        /\ status' = next
        /\ badge' = IF next = "Needs attention" THEN 1 ELSE 0
    /\ UNCHANGED <<deployed, onLatest, shown, rollout, fails, stableVersion, version, limits, rules, autonomy, keys>>

ShowDeploy ==
    /\ \E d \in 0..2 :
        \E n \in 0..d :
            /\ d # deployed \/ n # onLatest
            /\ deployed' = d
            /\ onLatest' = n
            /\ shown' = Percent(d, n)
    /\ UNCHANGED <<status, badge, rollout, fails, stableVersion, version, limits, rules, autonomy, keys>>

BeginRollout ==
    /\ rollout = "idle"
    /\ rollout' = "running"
    /\ fails' = 0
    /\ UNCHANGED <<status, deployed, onLatest, badge, shown, stableVersion, version, limits, rules, autonomy, keys>>

HealthPass ==
    /\ rollout = "running"
    /\ \E account \in Accounts :
        /\ version[account] # Candidate
        /\ version' = [id \in Accounts |-> IF id = account THEN Candidate ELSE version[id]]
        /\ rollout' = IF \A id \in Accounts : version'[id] = Candidate THEN "idle" ELSE "running"
        /\ stableVersion' = IF \A id \in Accounts : version'[id] = Candidate THEN Candidate ELSE stableVersion
        /\ fails' = IF \A id \in Accounts : version'[id] = Candidate THEN 0 ELSE fails
    /\ UNCHANGED <<status, deployed, onLatest, badge, shown, limits, rules, autonomy, keys>>

HealthFail ==
    /\ rollout = "running"
    /\ fails < 2
    /\ fails' = fails + 1
    /\ rollout' = IF fails + 1 = 2 THEN "idle" ELSE "running"
    /\ version' = IF fails + 1 = 2 THEN [account \in Accounts |-> stableVersion] ELSE version
    /\ UNCHANGED <<status, deployed, onLatest, badge, shown, stableVersion, limits, rules, autonomy, keys>>

RollOut == UNCHANGED vars

Next == SetStatus \/ ShowDeploy \/ BeginRollout \/ HealthPass \/ HealthFail \/ RollOut

Spec == Init /\ [][Next]_vars
====
