---- MODULE ChatDock ----
\* Chat and the dock share one draft and one message.
\* # model: packages/adapters/src/neon/commands/conversation.ts
\* # model: apps/web/src/workspace/provider.tsx
\* Idle accepts one message. A matched agent that is on moves to Working.
\* No agent and a paused agent answer at once and write no event.
\* The agent reply moves Working to Replied. A reload during Working
\* keeps the Task and writes no Result. A second message is out of this bound.

EXTENDS Integers

VARIABLES
    phase, page, dock, pageDraft, dockDraft, sent, skill,
    userMsg, masterMsg, agentMsg, taskEv, resultEv, tasks, lastSet,
    storeSame, stuck
vars == <<
    phase, page, dock, pageDraft, dockDraft, sent, skill,
    userMsg, masterMsg, agentMsg, taskEv, resultEv, tasks, lastSet,
    storeSame, stuck
>>

Phases == {"idle", "working", "replied"}
Pages == {"workspace", "chat", "admin"}
Docks == {"closed", "open", "hidden"}
Drafts == {"", "text"}
Sents == {"no", "none", "paused", "on", "noskill"}
Skills == {"none", "skill", "-"}
Bits == {0, 1}

TypeOK ==
    /\ phase \in Phases
    /\ page \in Pages
    /\ dock \in Docks
    /\ pageDraft \in Drafts
    /\ dockDraft \in Drafts
    /\ sent \in Sents
    /\ skill \in Skills
    /\ userMsg \in Bits
    /\ masterMsg \in Bits
    /\ agentMsg \in Bits
    /\ taskEv \in Bits
    /\ resultEv \in Bits
    /\ tasks \in Bits
    /\ lastSet \in BOOLEAN
    /\ storeSame \in BOOLEAN
    /\ stuck \in BOOLEAN

\* A user message comes before the master message.
\* A Task comes after both. A Result comes with the agent message, after the Task.
MessageOrder ==
    /\ masterMsg = 1 => userMsg = 1
    /\ taskEv = 1 => masterMsg = 1
    /\ resultEv = 1 => taskEv = 1 /\ agentMsg = 1
    /\ agentMsg = 1 => resultEv = 1
    /\ tasks = resultEv
    /\ lastSet <=> resultEv = 1
    /\ sent = "no" => userMsg = 0 /\ masterMsg = 0 /\ taskEv = 0 /\ resultEv = 0
    /\ sent \in {"none", "paused"} =>
        userMsg = 1 /\ masterMsg = 1 /\ taskEv = 0 /\ resultEv = 0 /\ agentMsg = 0
    /\ sent \in {"on", "noskill"} => userMsg = 1 /\ masterMsg = 1 /\ taskEv = 1

\* Working holds a Task and no Result.
\* No agent and a paused agent write no event.
\* A reload keeps the Task and writes no Result.
\* The phase matches the send, the stuck flag, and the Result.
SendShape ==
    /\ phase = "working" =>
        sent \in {"on", "noskill"} /\ stuck = FALSE /\ resultEv = 0 /\ taskEv = 1
    /\ phase = "replied" =>
        stuck = FALSE /\ (sent \in {"none", "paused"} \/ resultEv = 1)
    /\ phase = "idle" /\ stuck = FALSE => sent = "no" /\ taskEv = 0 /\ resultEv = 0
    /\ stuck => phase = "idle" /\ taskEv = 1 /\ resultEv = 0 /\ sent \in {"on", "noskill"}

\* The dock is hidden on the chat page and on an admin page.
DockHidden ==
    /\ page \in {"chat", "admin"} => dock = "hidden"
    /\ page = "workspace" => dock \in {"closed", "open"}

\* The page draft and the dock draft are the same value.
OneDraft ==
    /\ pageDraft = dockDraft
    /\ pageDraft = "text" => phase = "idle" /\ stuck = FALSE /\ sent = "no"

\* A Result names its writes and does not change the store.
WritesDoNotChangeStore == storeSame = TRUE

\* An agent with no skill on records the skill as a dash.
SkillDash ==
    /\ sent = "noskill" => skill = "-"
    /\ sent = "on" => skill = "skill"
    /\ sent \in {"no", "none", "paused"} => skill = "none"

Init ==
    /\ phase = "idle"
    /\ page = "workspace"
    /\ dock = "closed"
    /\ pageDraft = ""
    /\ dockDraft = ""
    /\ sent = "no"
    /\ skill = "none"
    /\ userMsg = 0
    /\ masterMsg = 0
    /\ agentMsg = 0
    /\ taskEv = 0
    /\ resultEv = 0
    /\ tasks = 0
    /\ lastSet = FALSE
    /\ storeSame = TRUE
    /\ stuck = FALSE

Type ==
    /\ phase = "idle"
    /\ stuck = FALSE
    /\ sent = "no"
    /\ pageDraft = ""
    /\ pageDraft' = "text"
    /\ dockDraft' = "text"
    /\ UNCHANGED <<phase, page, dock, sent, skill, userMsg, masterMsg, agentMsg, taskEv, resultEv, tasks, lastSet, storeSame, stuck>>

SendEmpty ==
    /\ phase = "idle"
    /\ stuck = FALSE
    /\ pageDraft = ""
    /\ UNCHANGED vars

SendNone ==
    /\ phase = "idle"
    /\ stuck = FALSE
    /\ sent = "no"
    /\ pageDraft = "text"
    /\ phase' = "replied"
    /\ sent' = "none"
    /\ userMsg' = 1
    /\ masterMsg' = 1
    /\ pageDraft' = ""
    /\ dockDraft' = ""
    /\ UNCHANGED <<page, dock, skill, agentMsg, taskEv, resultEv, tasks, lastSet, storeSame, stuck>>

SendPaused ==
    /\ phase = "idle"
    /\ stuck = FALSE
    /\ sent = "no"
    /\ pageDraft = "text"
    /\ phase' = "replied"
    /\ sent' = "paused"
    /\ userMsg' = 1
    /\ masterMsg' = 1
    /\ pageDraft' = ""
    /\ dockDraft' = ""
    /\ UNCHANGED <<page, dock, skill, agentMsg, taskEv, resultEv, tasks, lastSet, storeSame, stuck>>

SendOn ==
    /\ phase = "idle"
    /\ stuck = FALSE
    /\ sent = "no"
    /\ pageDraft = "text"
    /\ phase' = "working"
    /\ sent' = "on"
    /\ skill' = "skill"
    /\ userMsg' = 1
    /\ masterMsg' = 1
    /\ taskEv' = 1
    /\ pageDraft' = ""
    /\ dockDraft' = ""
    /\ UNCHANGED <<page, dock, agentMsg, resultEv, tasks, lastSet, storeSame, stuck>>

SendNoSkill ==
    /\ phase = "idle"
    /\ stuck = FALSE
    /\ sent = "no"
    /\ pageDraft = "text"
    /\ phase' = "working"
    /\ sent' = "noskill"
    /\ skill' = "-"
    /\ userMsg' = 1
    /\ masterMsg' = 1
    /\ taskEv' = 1
    /\ pageDraft' = ""
    /\ dockDraft' = ""
    /\ UNCHANGED <<page, dock, agentMsg, resultEv, tasks, lastSet, storeSame, stuck>>

Finish ==
    /\ phase = "working"
    /\ phase' = "replied"
    /\ resultEv' = 1
    /\ agentMsg' = 1
    /\ tasks' = 1
    /\ lastSet' = TRUE
    /\ UNCHANGED <<page, dock, pageDraft, dockDraft, sent, skill, userMsg, masterMsg, taskEv, storeSame, stuck>>

Reload ==
    /\ phase = "working"
    /\ phase' = "idle"
    /\ stuck' = TRUE
    /\ UNCHANGED <<page, dock, pageDraft, dockDraft, sent, skill, userMsg, masterMsg, agentMsg, taskEv, resultEv, tasks, lastSet, storeSame>>

SecondSend ==
    /\ phase = "working"
    /\ UNCHANGED vars

OpenDock ==
    /\ page = "workspace"
    /\ dock = "closed"
    /\ dock' = "open"
    /\ UNCHANGED <<phase, page, pageDraft, dockDraft, sent, skill, userMsg, masterMsg, agentMsg, taskEv, resultEv, tasks, lastSet, storeSame, stuck>>

CloseDock ==
    /\ page = "workspace"
    /\ dock = "open"
    /\ dock' = "closed"
    /\ UNCHANGED <<phase, page, pageDraft, dockDraft, sent, skill, userMsg, masterMsg, agentMsg, taskEv, resultEv, tasks, lastSet, storeSame, stuck>>

OpenChat ==
    /\ page # "chat"
    /\ page' = "chat"
    /\ dock' = "hidden"
    /\ UNCHANGED <<phase, pageDraft, dockDraft, sent, skill, userMsg, masterMsg, agentMsg, taskEv, resultEv, tasks, lastSet, storeSame, stuck>>

LeaveChat ==
    /\ page = "chat"
    /\ page' = "workspace"
    /\ dock' = "closed"
    /\ UNCHANGED <<phase, pageDraft, dockDraft, sent, skill, userMsg, masterMsg, agentMsg, taskEv, resultEv, tasks, lastSet, storeSame, stuck>>

OpenAdmin ==
    /\ page # "admin"
    /\ page' = "admin"
    /\ dock' = "hidden"
    /\ UNCHANGED <<phase, pageDraft, dockDraft, sent, skill, userMsg, masterMsg, agentMsg, taskEv, resultEv, tasks, lastSet, storeSame, stuck>>

LeaveAdmin ==
    /\ page = "admin"
    /\ page' = "workspace"
    /\ dock' = "closed"
    /\ UNCHANGED <<phase, pageDraft, dockDraft, sent, skill, userMsg, masterMsg, agentMsg, taskEv, resultEv, tasks, lastSet, storeSame, stuck>>

Stay ==
    /\ phase = "replied" \/ stuck
    /\ UNCHANGED vars

Next ==
    \/ Type
    \/ SendEmpty
    \/ SendNone
    \/ SendPaused
    \/ SendOn
    \/ SendNoSkill
    \/ Finish
    \/ Reload
    \/ SecondSend
    \/ OpenDock
    \/ CloseDock
    \/ OpenChat
    \/ LeaveChat
    \/ OpenAdmin
    \/ LeaveAdmin
    \/ Stay

Spec == Init /\ [][Next]_vars

====
