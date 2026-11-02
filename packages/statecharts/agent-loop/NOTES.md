# Agent loop

The model itself is built in task 05. This note is not a TLA+ model.

Decision 32 adds three states: Waiting, Blocked and Dropped.

## States

Waiting, Planning, Running skill, Checking, Done, Sent back, Blocked, Escalated, Dropped.

## Rules

A task reaches Done only through Checking with a pass. A second fail always reaches Escalated. Blocked means the agent waits for a person and holds no machine slot. Dropped means there was nothing to do, and it ends with no message unless a rule asks for one. A skill with gate Ask first never runs before an Approval. An Approval always carries a Mandate. The agent holds no task state outside the bus.

The two new rules are the Blocked sentence and the Dropped sentence.
