---
name: tensquads-verify
description: "Check a tensquads behaviour model after a change to its code, its tests, or its statechart. Use when an approval, a sign-up step, a chat message, or a dock send changes."
---

# Behaviour models

Read every file in `models/`. A later screen task adds one file and does not edit this file.

Run the checks in the model file that matches the change. Do not weaken an invariant so that a run passes.

TLC does not prove the TypeScript. Run the code check and the model check. `/statechart` is the only way to read the TLC result. Do not copy its command into this skill or into a script.
