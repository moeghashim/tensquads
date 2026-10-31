---- MODULE Approval ----
\* One pending spend approval and one proposed mission.
\* The steps match packages/domain/src/policy/decide.ts.
\* Main.dc.html:1165 approves a spend. Main.dc.html:1175 approves a mission.
\* Main.dc.html:1429 counts Pending approvals plus Proposed proposals.

EXTENDS Integers

CONSTANT EmptyInbox

VARIABLES approval, proposal, tasks, last, mission, contribution, badge, banner
vars == <<approval, proposal, tasks, last, mission, contribution, badge, banner>>

InitialTasks == 1
InitialContribution == 10

ApprovalStates == {"Pending", "Approved", "Declined"}
ProposalStates == {"Proposed", "Revising", "Approved"}

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

Init ==
    /\ approval = "Pending"
    /\ proposal = "Proposed"
    /\ tasks = InitialTasks
    /\ last = "seed"
    /\ mission = "old"
    /\ contribution = InitialContribution
    /\ badge = Count(approval, proposal)
    /\ banner = BannerFor(approval, proposal)

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
        /\ mission = "old"
        /\ contribution = InitialContribution

BadgeMatches == badge = Count(approval, proposal)

RevisingNotCounted ==
    proposal = "Revising" => badge = (IF approval = "Pending" THEN 1 ELSE 0)

EmptyCopy == Empty(approval, proposal) <=> banner = EmptyInbox

ApproveSpend ==
    /\ approval = "Pending"
    /\ approval' = "Approved"
    /\ tasks' = tasks + 1
    /\ last' = "title (approved)"
    /\ UNCHANGED <<proposal, mission, contribution>>
    /\ badge' = Count(approval', proposal)
    /\ banner' = BannerFor(approval', proposal)

DeclineSpend ==
    /\ approval = "Pending"
    /\ approval' = "Declined"
    /\ UNCHANGED <<tasks, last, proposal, mission, contribution>>
    /\ badge' = Count(approval', proposal)
    /\ banner' = BannerFor(approval', proposal)

ApproveMission ==
    /\ proposal = "Proposed"
    /\ proposal' = "Approved"
    /\ mission' = "new"
    /\ contribution' = 0
    /\ UNCHANGED <<approval, tasks, last>>
    /\ badge' = Count(approval, proposal')
    /\ banner' = BannerFor(approval, proposal')

DeclineMission ==
    /\ proposal = "Proposed"
    /\ proposal' = "Revising"
    /\ UNCHANGED <<approval, tasks, last, mission, contribution>>
    /\ badge' = Count(approval, proposal')
    /\ banner' = BannerFor(approval, proposal')

Idle ==
    /\ approval # "Pending"
    /\ proposal # "Proposed"
    /\ UNCHANGED vars

Next == ApproveSpend \/ DeclineSpend \/ ApproveMission \/ DeclineMission \/ Idle

Spec == Init /\ [][Next]_vars

====
