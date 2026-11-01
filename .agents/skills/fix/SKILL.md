---
name: fix
description: Fix a bug or regression end-to-end with a reproduction and regression test. Use when something is broken, failing, or behaving incorrectly and the user wants it repaired.
---

# /fix

Purpose: fix a bug or issue end-to-end with regression safety.

Workflow:
1. Reproduce and isolate the root cause.
2. Write or identify a failing test, repro script, or equivalent proof before claiming the fix.
3. If the fix touches React, Next.js, UI review, or transitions, read `docs/agent-skills.md` and load the relevant Vercel skill before editing.
4. Load the `test-driven-development` and `security-and-hardening` skills when the issue changes behavior or touches a trust boundary.
5. Implement the smallest safe fix.
6. Add or update regression tests.
7. Run `npm run check`, `npm test`, `npm run fallow:audit`, and `npm run agent:check`.
8. Summarize behavior change, repro coverage, tests added, and residual risks.
