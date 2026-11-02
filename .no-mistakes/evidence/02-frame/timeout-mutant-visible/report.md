# ChatDock

TLC reached 336 states and 1828 steps. The chart draws 4 states and 9 arrows.
The chart does not draw 1428 steps that stay in one chart state.

## WaitEnds breaks
TLC's counterexample is in tlc-WaitEnds.out. It has 6 steps:
0. none
1. Type: none
2. StartBegin: begin
3. Type: begin
4. BeginTimeout: refresh
5. OpenAdmin: refresh
6. LeaveAdmin: refresh
The run stays in "refresh" forever.

## Rules that hold
TypeOK, MessageOrder, SendShape, DockHidden, OneDraft, WritesDoNotChangeStore, SkillDash, BoundedWait, NoDeadlock, SendAgain
