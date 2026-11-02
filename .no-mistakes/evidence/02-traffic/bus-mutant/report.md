# Bus

TLC reached 56 states and 147 steps. The chart draws 56 states and 147 arrows.

## AllClicksDrain breaks
TLC's counterexample is in tlc-AllClicksDrain.out. It has 6 steps:
0. snapEscalation=0 manual=0 playback="Paused" selected="none" delivery="ready" applied=FALSE repeat=FALSE snapCount=0 appended=FALSE hidden=FALSE guard="idle" snapApplied=FALSE count=0 snapDelivery="ready" escalation=0
1. Resume: snapEscalation=0 manual=0 playback="Live" selected="none" delivery="ready" applied=FALSE repeat=FALSE snapCount=0 appended=FALSE hidden=FALSE guard="idle" snapApplied=FALSE count=0 snapDelivery="ready" escalation=0
2. LiveStart: snapEscalation=0 manual=0 playback="Live" selected="none" delivery="ready" applied=FALSE repeat=FALSE snapCount=0 appended=FALSE hidden=FALSE guard="waiting" snapApplied=FALSE count=0 snapDelivery="ready" escalation=0
3. SendWhileWaiting: snapEscalation=0 manual=1 playback="Live" selected="none" delivery="ready" applied=FALSE repeat=FALSE snapCount=0 appended=FALSE hidden=FALSE guard="waiting" snapApplied=FALSE count=0 snapDelivery="ready" escalation=0
4. LiveCommit: snapEscalation=0 manual=1 playback="Live" selected="held" delivery="acknowledged" applied=TRUE repeat=FALSE snapCount=0 appended=TRUE hidden=FALSE guard="idle" snapApplied=FALSE count=1 snapDelivery="ready" escalation=0
5. Repeat: snapEscalation=0 manual=1 playback="Live" selected="held" delivery="acknowledged" applied=TRUE repeat=TRUE snapCount=1 appended=TRUE hidden=FALSE guard="idle" snapApplied=TRUE count=1 snapDelivery="acknowledged" escalation=0
6. Filter: snapEscalation=0 manual=1 playback="Live" selected="held" delivery="acknowledged" applied=TRUE repeat=TRUE snapCount=1 appended=TRUE hidden=TRUE guard="idle" snapApplied=TRUE count=1 snapDelivery="acknowledged" escalation=0
The run stops in "snapEscalation=0 manual=1 playback="Live" selected="held" delivery="acknowledged" applied=TRUE repeat=TRUE snapCount=1 appended=TRUE hidden=TRUE guard="idle" snapApplied=TRUE count=1 snapDelivery="acknowledged" escalation=0" forever.

## Rules that hold
TypeOK, WritesMatch, AppendsWithWrites, OneEscalation, FilterKeepsInspector, RepeatHolds, NoDeadlock, WaitEnds, QueuedClickRuns
