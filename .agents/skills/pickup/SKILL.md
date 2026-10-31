---
name: pickup
description: Rehydrate context before implementation work in this repo. Use at the start of a session, when resuming a branch, or when asked to pick up where a previous agent or engineer left off.
---

# /pickup

Purpose: rehydrate context quickly before doing implementation work.

Checklist:
1. Read `AGENTS.md` and any relevant docs under `docs/`.
2. Read `docs/agent-skills.md` if the task touches React, Next.js, UI review, transitions, testing strategy, review rigor, security, ADR decisions, or memory-leak debugging.
3. If UI or interaction work is involved, load the relevant Vercel skill (`react-best-practices`, `composition-patterns`, `react-view-transitions`, `web-design-guidelines`).
4. If process rigor, testing, review, security, or ADR work is involved, load the relevant Addy skill (`test-driven-development`, `code-review-and-quality`, `security-and-hardening`, `documentation-and-adrs`).
5. Use the `context-engineering` skill to load only the minimum durable context needed for the current task.
6. Review recent entries in `progress.md` and summarize the key learnings that apply to this task.
7. Run `git status -sb` and summarize working tree state.
8. Identify current branch and any related release or deploy context.
9. Run or review the latest `npm run check`, `npm test`, `npm run fallow:audit`, and `npm run agent:check` results.
10. List the next 2-3 concrete actions before editing.
