---
name: handoff
description: Package the current state of work so another engineer or agent can continue immediately. Use when asked to hand off, wrap up a session for someone else, or write handoff notes.
---

# /handoff

Purpose: package current state so another engineer or agent can continue immediately.

Include:
1. Scope, completed work, and remaining tasks.
2. `git status -sb` summary and branch name.
3. Commands run with outcomes (`check`, `test`, `fallow:audit`, `agent:check`).
4. Any blockers, risks, and required follow-up.
5. Ordered next steps with exact commands when possible.
