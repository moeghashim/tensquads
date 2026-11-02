---- MODULE Approval ----
\* One pending spend approval and one proposed mission.
\* A click starts a write. A second click on the other card waits behind it.
\* A failed write and a late write change no stored decision. The read then
\* reloads, and a waiting click starts. The 30 second timers are WriteLate
\* and ReadTimeout. Fairness on those two is the timer.
\* # model: packages/domain/src/policy/decide.ts
\* # model: packages/adapters/src/neon/commands/approvals.ts
\* # model: apps/web/src/screens/overview/actions.ts
\* Main.dc.html:1165 approves a spend. Main.dc.html:1175 approves a mission.
\* Main.dc.html:1186 asks to revise when that agent has no proposal left.
\* Main.dc.html:1429 counts Pending approvals plus Proposed proposals.
\* Approve and Decline each add one bus event and one approvals.<id> state key.
\* Approve also records one Mandate. Decline and a mission action record none.

EXTENDS Integers

CONSTANT EmptyInbox

VARIABLES approval, proposal, tasks, last, mission, contribution, badge, banner, fromApproval, events, stateKey, mandate, wait, inflight, queued, clicks
vars == <<approval, proposal, tasks, last, mission, contribution, badge, banner, fromApproval, events, stateKey, mandate, wait, inflight, queued, clicks>>
stored == <<approval, proposal, tasks, last, mission, contribution, badge, banner, fromApproval, events, stateKey, mandate>>

InitialTasks == 1
InitialContribution == 10

ApprovalStates == {"Pending", "Approved", "Declined"}
ProposalStates == {"Proposed", "Revising", "Approved"}
StateKeys == {"", "approved", "declined"}
Waits == {"none", "write", "read"}
Kinds == {"none", "approve", "decline", "mission", "revise"}
SpendKinds == {"approve", "decline"}
MissionKinds == {"mission", "revise"}

Count(a, p) ==
    (IF a = "Pending" THEN 1 ELSE 0) + (IF p = "Proposed" THEN 1 ELSE 0)

Empty(a, p) == a \in {"Approved", "Declined"} /\ p = "Approved"

BannerFor(a, p) == IF Empty(a, p) THEN EmptyInbox ELSE ""

TypeOK ==
    /\ approval \in ApprovalStates
    /\ proposal \in ProposalStates
    /\ tasks \in {InitialTasks, InitialTasks + 1}
    /\ last \in {"seed", "title (approved)"}
    /\ mission \in {"old", "new"}
    /\ contribution \in {0, InitialContribution}
    /\ badge \in 0..2
    /\ banner \in {"", EmptyInbox}
    /\ fromApproval \in BOOLEAN
    /\ events \in 0..1
    /\ stateKey \in StateKeys
    /\ mandate \in BOOLEAN
    /\ wait \in Waits
    /\ inflight \in Kinds
    /\ queued \in Kinds
    /\ clicks \in 0..3

\* A waiting write has one decision in flight. The other card can wait behind it.
\* The same card is not in flight and queued.
WaitShape ==
    /\ (wait = "none" => inflight = "none" /\ queued = "none")
    /\ (wait \in {"write", "read"} => inflight # "none")
    /\ (queued # "none" => queued # inflight /\ wait # "none")
    /\ ~ (inflight \in SpendKinds /\ queued \in SpendKinds)
    /\ ~ (inflight \in MissionKinds /\ queued \in MissionKinds)

Init ==
    /\ approval = "Pending"
    /\ proposal = "Proposed"
    /\ tasks = InitialTasks
    /\ last = "seed"
    /\ mission = "old"
    /\ contribution = InitialContribution
    /\ fromApproval = FALSE
    /\ events = 0
    /\ stateKey = ""
    /\ mandate = FALSE
    /\ badge = Count(approval, proposal)
    /\ banner = BannerFor(approval, proposal)
    /\ wait = "none"
    /\ inflight = "none"
    /\ queued = "none"
    /\ clicks = 3

SpendApproved ==
    approval = "Approved" => tasks = InitialTasks + 1 /\ last = "title (approved)"

SpendDeclined ==
    approval = "Declined" => tasks = InitialTasks /\ last = "seed"

MissionKeepsTasks ==
    proposal = "Approved" =>
        /\ mission = "new"
        /\ contribution = 0
        /\ tasks = (IF approval = "Approved" THEN InitialTasks + 1 ELSE InitialTasks)

MissionRevise ==
    proposal = "Revising" =>
        IF fromApproval
        THEN mission = "new" /\ contribution = 0
        ELSE mission = "old" /\ contribution = InitialContribution

\* The badge sum is written out here. It does not call Count.
BadgeMatches ==
    badge = (IF approval = "Pending" THEN 1 ELSE 0) + (IF proposal = "Proposed" THEN 1 ELSE 0)

RevisingNotCounted ==
    proposal = "Revising" => badge = (IF approval = "Pending" THEN 1 ELSE 0)

EmptyCopy == Empty(approval, proposal) <=> banner = EmptyInbox

EventRecorded ==
    /\ (approval = "Pending" => events = 0 /\ stateKey = "")
    /\ (approval = "Approved" => events = 1 /\ stateKey = "approved")
    /\ (approval = "Declined" => events = 1 /\ stateKey = "declined")

MandateRecorded == (mandate = TRUE) <=> (approval = "Approved")

Start(kind) ==
    /\ clicks' = clicks - 1
    /\ IF wait = "none"
       THEN /\ inflight' = kind
            /\ wait' = "write"
            /\ UNCHANGED queued
       ELSE /\ queued' = kind
            /\ UNCHANGED <<inflight, wait>>

ClickApprove ==
    /\ clicks > 0
    /\ approval = "Pending"
    /\ inflight \notin SpendKinds
    /\ queued \notin SpendKinds
    /\ Start("approve")
    /\ UNCHANGED stored

ClickDecline ==
    /\ clicks > 0
    /\ approval = "Pending"
    /\ inflight \notin SpendKinds
    /\ queued \notin SpendKinds
    /\ Start("decline")
    /\ UNCHANGED stored

ClickMission ==
    /\ clicks > 0
    /\ proposal = "Proposed"
    /\ inflight \notin MissionKinds
    /\ queued \notin MissionKinds
    /\ Start("mission")
    /\ UNCHANGED stored

ClickRevise ==
    /\ clicks > 0
    /\ proposal \in {"Proposed", "Approved"}
    /\ inflight \notin MissionKinds
    /\ queued \notin MissionKinds
    /\ Start("revise")
    /\ UNCHANGED stored

ApproveSpend ==
    /\ wait = "write"
    /\ inflight = "approve"
    /\ approval = "Pending"
    /\ approval' = "Approved"
    /\ tasks' = tasks + 1
    /\ last' = "title (approved)"
    /\ events' = events + 1
    /\ stateKey' = "approved"
    /\ mandate' = TRUE
    /\ wait' = "read"
    /\ UNCHANGED <<proposal, mission, contribution, fromApproval, inflight, queued, clicks>>
    /\ badge' = Count(approval', proposal)
    /\ banner' = BannerFor(approval', proposal)

DeclineSpend ==
    /\ wait = "write"
    /\ inflight = "decline"
    /\ approval = "Pending"
    /\ approval' = "Declined"
    /\ events' = events + 1
    /\ stateKey' = "declined"
    /\ wait' = "read"
    /\ UNCHANGED <<tasks, last, proposal, mission, contribution, fromApproval, mandate, inflight, queued, clicks>>
    /\ badge' = Count(approval', proposal)
    /\ banner' = BannerFor(approval', proposal)

ApproveMission ==
    /\ wait = "write"
    /\ inflight = "mission"
    /\ proposal = "Proposed"
    /\ proposal' = "Approved"
    /\ mission' = "new"
    /\ contribution' = 0
    /\ fromApproval' = FALSE
    /\ wait' = "read"
    /\ UNCHANGED <<approval, tasks, last, events, stateKey, mandate, inflight, queued, clicks>>
    /\ badge' = Count(approval, proposal')
    /\ banner' = BannerFor(approval, proposal')

DeclineMission ==
    /\ wait = "write"
    /\ inflight = "revise"
    /\ proposal = "Proposed"
    /\ proposal' = "Revising"
    /\ fromApproval' = FALSE
    /\ wait' = "read"
    /\ UNCHANGED <<approval, tasks, last, mission, contribution, events, stateKey, mandate, inflight, queued, clicks>>
    /\ badge' = Count(approval, proposal')
    /\ banner' = BannerFor(approval, proposal')

AskRevise ==
    /\ wait = "write"
    /\ inflight = "revise"
    /\ proposal = "Approved"
    /\ proposal' = "Revising"
    /\ fromApproval' = TRUE
    /\ wait' = "read"
    /\ UNCHANGED <<approval, tasks, last, mission, contribution, events, stateKey, mandate, inflight, queued, clicks>>
    /\ badge' = Count(approval, proposal')
    /\ banner' = BannerFor(approval, proposal')

\* The write did not commit. The Approval and the Mandate stay as they were.
WriteFail ==
    /\ wait = "write"
    /\ wait' = "read"
    /\ UNCHANGED stored
    /\ UNCHANGED <<inflight, queued, clicks>>

WriteLate ==
    /\ wait = "write"
    /\ wait' = "read"
    /\ UNCHANGED stored
    /\ UNCHANGED <<inflight, queued, clicks>>

FinishRead ==
    /\ wait = "read"
    /\ IF queued = "none"
       THEN /\ wait' = "none"
            /\ inflight' = "none"
            /\ UNCHANGED queued
       ELSE /\ wait' = "write"
            /\ inflight' = queued
            /\ queued' = "none"
    /\ UNCHANGED stored
    /\ UNCHANGED clicks

ReadReload == FinishRead
ReadTimeout == FinishRead

Idle ==
    /\ wait = "none"
    /\ UNCHANGED vars

Next ==
    \/ ClickApprove
    \/ ClickDecline
    \/ ClickMission
    \/ ClickRevise
    \/ ApproveSpend
    \/ DeclineSpend
    \/ ApproveMission
    \/ DeclineMission
    \/ AskRevise
    \/ WriteFail
    \/ WriteLate
    \/ ReadReload
    \/ ReadTimeout
    \/ Idle

WaitEnds == [](wait # "none" => <>(wait = "none"))

Spec == Init /\ [][Next]_vars /\ WF_vars(WriteLate) /\ WF_vars(ReadTimeout)

====
