# ChatDock

TLC reached 336 states and 1828 steps. The chart draws 336 states and 1552 arrows.
The chart does not draw 276 steps that stay in one chart state.

## WaitEnds breaks
TLC's counterexample is in tlc-WaitEnds.out. It has 6 steps:
0. phase="idle" pageDraft="" dockDraft="" dock="closed" tasks=0 abandoned=FALSE wait="none" lastSet=FALSE userMsg=0 masterMsg=0 abandonedTask=FALSE sent="no" storeSame=TRUE page="workspace" skill="none" agentMsg=0 resultEv=0 held="closed" taskEv=0
1. Type: phase="idle" pageDraft="text" dockDraft="text" dock="closed" tasks=0 abandoned=FALSE wait="none" lastSet=FALSE userMsg=0 masterMsg=0 abandonedTask=FALSE sent="no" storeSame=TRUE page="workspace" skill="none" agentMsg=0 resultEv=0 held="closed" taskEv=0
2. StartBegin: phase="idle" pageDraft="" dockDraft="" dock="closed" tasks=0 abandoned=FALSE wait="begin" lastSet=FALSE userMsg=0 masterMsg=0 abandonedTask=FALSE sent="no" storeSame=TRUE page="workspace" skill="none" agentMsg=0 resultEv=0 held="closed" taskEv=0
3. Type: phase="idle" pageDraft="text" dockDraft="text" dock="closed" tasks=0 abandoned=FALSE wait="begin" lastSet=FALSE userMsg=0 masterMsg=0 abandonedTask=FALSE sent="no" storeSame=TRUE page="workspace" skill="none" agentMsg=0 resultEv=0 held="closed" taskEv=0
4. BeginTimeout: phase="idle" pageDraft="text" dockDraft="text" dock="closed" tasks=0 abandoned=FALSE wait="refresh" lastSet=FALSE userMsg=0 masterMsg=0 abandonedTask=FALSE sent="no" storeSame=TRUE page="workspace" skill="none" agentMsg=0 resultEv=0 held="closed" taskEv=0
5. OpenAdmin: phase="idle" pageDraft="text" dockDraft="text" dock="hidden" tasks=0 abandoned=FALSE wait="refresh" lastSet=FALSE userMsg=0 masterMsg=0 abandonedTask=FALSE sent="no" storeSame=TRUE page="admin" skill="none" agentMsg=0 resultEv=0 held="closed" taskEv=0
6. LeaveAdmin: phase="idle" pageDraft="text" dockDraft="text" dock="closed" tasks=0 abandoned=FALSE wait="refresh" lastSet=FALSE userMsg=0 masterMsg=0 abandonedTask=FALSE sent="no" storeSame=TRUE page="workspace" skill="none" agentMsg=0 resultEv=0 held="closed" taskEv=0
The run loops through "phase="idle" pageDraft="text" dockDraft="text" dock="closed" tasks=0 abandoned=FALSE wait="refresh" lastSet=FALSE userMsg=0 masterMsg=0 abandonedTask=FALSE sent="no" storeSame=TRUE page="workspace" skill="none" agentMsg=0 resultEv=0 held="closed" taskEv=0" and "phase="idle" pageDraft="text" dockDraft="text" dock="hidden" tasks=0 abandoned=FALSE wait="refresh" lastSet=FALSE userMsg=0 masterMsg=0 abandonedTask=FALSE sent="no" storeSame=TRUE page="admin" skill="none" agentMsg=0 resultEv=0 held="closed" taskEv=0" forever.

## Rules that hold
TypeOK, MessageOrder, SendShape, DockHidden, OneDraft, WritesDoNotChangeStore, SkillDash, BoundedWait, NoDeadlock, SendAgain
