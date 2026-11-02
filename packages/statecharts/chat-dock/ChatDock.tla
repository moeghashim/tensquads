---- MODULE ChatDock ----
\* Chat and the dock share one draft and one message.
\* # model: packages/adapters/src/neon/commands/conversation.ts
\* # model: apps/web/src/workspace/provider.tsx
\* # model: packages/adapters/src/pending-window.ts
\* Idle accepts one message. A matched agent that is on moves to Working.
\* No agent and a paused agent answer at once and write no event.
\* The agent reply moves Working to Replied. A reload during Working
\* keeps the Task and writes no Result. Timeout permits another message.
\* Chat and admin hide the dock and restore the open or closed choice.
\* A draft can be typed during Idle, Working, and Replied.
\* A finish request that does not settle returns to Idle and keeps that draft.

EXTENDS Integers

VARIABLES
    phase, page, dock, held, pageDraft, dockDraft, sent, skill,
    userMsg, masterMsg, agentMsg, taskEv, resultEv, tasks, lastSet,
    storeSame, abandoned, abandonedTask
vars == <<
    phase, page, dock, held, pageDraft, dockDraft, sent, skill,
    userMsg, masterMsg, agentMsg, taskEv, resultEv, tasks, lastSet,
    storeSame, abandoned, abandonedTask
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
    /\ held \in {"closed", "open"}
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
    /\ abandoned \in BOOLEAN
    /\ abandonedTask \in BOOLEAN

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
\* The phase matches the send, the abandon flag, and the Result.
SendShape ==
    /\ phase = "working" =>
        sent \in {"on", "noskill"} /\ abandoned = FALSE /\ resultEv = 0 /\ taskEv = 1
    /\ phase = "replied" =>
        abandoned = FALSE /\ (sent \in {"none", "paused"} \/ resultEv = 1)
    /\ phase = "idle" /\ abandoned = FALSE => sent = "no" /\ taskEv = 0 /\ resultEv = 0
    /\ abandoned => phase = "idle" /\ taskEv = 1 /\ resultEv = 0 /\ sent \in {"on", "noskill"}

\* The dock is hidden on the chat page and on an admin page.
DockHidden ==
    /\ page \in {"chat", "admin"} => dock = "hidden"
    /\ page = "workspace" => dock \in {"closed", "open"}
    /\ dock \in {"closed", "open"} => held = dock

\* The page draft and the dock draft are the same value.
\* Text is allowed while the agent works, after the reply, and before a send.
OneDraft ==
    /\ pageDraft = dockDraft
    /\ pageDraft = "text" =>
        \/ phase \in {"working", "replied"}
        \/ (phase = "idle" /\ abandoned = FALSE /\ sent = "no")

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
    /\ held = "closed"
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
    /\ abandoned = FALSE
    /\ abandonedTask = FALSE

Type ==
    /\ pageDraft = ""
    /\ ((phase = "idle" /\ abandoned = FALSE /\ sent = "no") \/ phase \in {"working", "replied"})
    /\ pageDraft' = "text"
    /\ dockDraft' = "text"
    /\ UNCHANGED <<phase, page, dock, held, sent, skill, userMsg, masterMsg, agentMsg, taskEv, resultEv, tasks, lastSet, storeSame, abandoned, abandonedTask>>

SendEmpty ==
    /\ phase = "idle"
    /\ abandoned = FALSE
    /\ pageDraft = ""
    /\ UNCHANGED vars

SendNone ==
    /\ phase = "idle"
    /\ abandoned = FALSE
    /\ sent = "no"
    /\ pageDraft = "text"
    /\ phase' = "replied"
    /\ sent' = "none"
    /\ userMsg' = 1
    /\ masterMsg' = 1
    /\ pageDraft' = ""
    /\ dockDraft' = ""
    /\ UNCHANGED <<page, dock, held, skill, agentMsg, taskEv, resultEv, tasks, lastSet, storeSame, abandoned, abandonedTask>>

SendPaused ==
    /\ phase = "idle"
    /\ abandoned = FALSE
    /\ sent = "no"
    /\ pageDraft = "text"
    /\ phase' = "replied"
    /\ sent' = "paused"
    /\ userMsg' = 1
    /\ masterMsg' = 1
    /\ pageDraft' = ""
    /\ dockDraft' = ""
    /\ UNCHANGED <<page, dock, held, skill, agentMsg, taskEv, resultEv, tasks, lastSet, storeSame, abandoned, abandonedTask>>

SendOn ==
    /\ phase = "idle"
    /\ abandoned = FALSE
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
    /\ UNCHANGED <<page, dock, held, agentMsg, resultEv, tasks, lastSet, storeSame, abandoned, abandonedTask>>

SendNoSkill ==
    /\ phase = "idle"
    /\ abandoned = FALSE
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
    /\ UNCHANGED <<page, dock, held, agentMsg, resultEv, tasks, lastSet, storeSame, abandoned, abandonedTask>>

Finish ==
    /\ phase = "working"
    /\ phase' = "replied"
    /\ resultEv' = 1
    /\ agentMsg' = 1
    /\ tasks' = 1
    /\ lastSet' = TRUE
    /\ UNCHANGED <<page, dock, held, pageDraft, dockDraft, sent, skill, userMsg, masterMsg, taskEv, storeSame, abandoned, abandonedTask>>

Reload ==
    /\ phase = "working"
    /\ phase' = "idle"
    /\ abandoned' = TRUE
    /\ pageDraft' = ""
    /\ dockDraft' = ""
    /\ UNCHANGED <<page, dock, held, sent, skill, userMsg, masterMsg, agentMsg, taskEv, resultEv, tasks, lastSet, storeSame, abandonedTask>>

SecondSend ==
    /\ phase = "working"
    /\ UNCHANGED vars

OpenDock ==
    /\ page = "workspace"
    /\ dock = "closed"
    /\ dock' = "open"
    /\ held' = "open"
    /\ UNCHANGED <<phase, page, pageDraft, dockDraft, sent, skill, userMsg, masterMsg, agentMsg, taskEv, resultEv, tasks, lastSet, storeSame, abandoned, abandonedTask>>

CloseDock ==
    /\ page = "workspace"
    /\ dock = "open"
    /\ dock' = "closed"
    /\ held' = "closed"
    /\ UNCHANGED <<phase, page, pageDraft, dockDraft, sent, skill, userMsg, masterMsg, agentMsg, taskEv, resultEv, tasks, lastSet, storeSame, abandoned, abandonedTask>>

OpenChat ==
    /\ page # "chat"
    /\ page' = "chat"
    /\ dock' = "hidden"
    /\ UNCHANGED <<phase, held, pageDraft, dockDraft, sent, skill, userMsg, masterMsg, agentMsg, taskEv, resultEv, tasks, lastSet, storeSame, abandoned, abandonedTask>>

LeaveChat ==
    /\ page = "chat"
    /\ page' = "workspace"
    /\ dock' = held
    /\ UNCHANGED <<phase, held, pageDraft, dockDraft, sent, skill, userMsg, masterMsg, agentMsg, taskEv, resultEv, tasks, lastSet, storeSame, abandoned, abandonedTask>>

OpenAdmin ==
    /\ page # "admin"
    /\ page' = "admin"
    /\ dock' = "hidden"
    /\ UNCHANGED <<phase, held, pageDraft, dockDraft, sent, skill, userMsg, masterMsg, agentMsg, taskEv, resultEv, tasks, lastSet, storeSame, abandoned, abandonedTask>>

LeaveAdmin ==
    /\ page = "admin"
    /\ page' = "workspace"
    /\ dock' = held
    /\ UNCHANGED <<phase, held, pageDraft, dockDraft, sent, skill, userMsg, masterMsg, agentMsg, taskEv, resultEv, tasks, lastSet, storeSame, abandoned, abandonedTask>>

Timeout ==
    /\ phase = "idle"
    /\ abandoned
    /\ phase' = "idle"
    /\ abandoned' = FALSE
    /\ abandonedTask' = TRUE
    /\ sent' = "no"
    /\ skill' = "none"
    /\ userMsg' = 0
    /\ masterMsg' = 0
    /\ agentMsg' = 0
    /\ taskEv' = 0
    /\ resultEv' = 0
    /\ tasks' = 0
    /\ lastSet' = FALSE
    /\ UNCHANGED <<page, dock, held, pageDraft, dockDraft, storeSame>>

ClientTimeout ==
    /\ phase = "working"
    /\ phase' = "idle"
    /\ abandoned' = FALSE
    /\ abandonedTask' = TRUE
    /\ sent' = "no"
    /\ skill' = "none"
    /\ userMsg' = 0
    /\ masterMsg' = 0
    /\ agentMsg' = 0
    /\ taskEv' = 0
    /\ resultEv' = 0
    /\ tasks' = 0
    /\ lastSet' = FALSE
    /\ UNCHANGED <<page, dock, held, pageDraft, dockDraft, storeSame>>

NextMessage ==
    /\ phase = "replied"
    /\ phase' = "idle"
    /\ sent' = "no"
    /\ skill' = "none"
    /\ userMsg' = 0
    /\ masterMsg' = 0
    /\ agentMsg' = 0
    /\ taskEv' = 0
    /\ resultEv' = 0
    /\ tasks' = 0
    /\ lastSet' = FALSE
    /\ UNCHANGED <<page, dock, held, pageDraft, dockDraft, storeSame, abandoned, abandonedTask>>

Stay ==
    /\ phase = "replied" \/ abandoned
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
    \/ Timeout
    \/ ClientTimeout
    \/ NextMessage

Resolve == Finish \/ Reload
SendAgain == []<>(phase = "idle" /\ ~abandoned /\ sent = "no")

Spec == Init /\ [][Next]_vars
    /\ WF_vars(Resolve) /\ WF_vars(Timeout) /\ WF_vars(NextMessage)

====
