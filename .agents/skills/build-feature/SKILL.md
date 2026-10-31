---
name: build-feature
description: Build a net-new feature as a tracer bullet, one small end-to-end slice at a time. Use when asked to add a feature, start a new capability, or build something that spans several layers.
---

# /build-feature

Purpose: build a net-new feature as a tracer bullet before expanding scope.

Workflow:
1. Define the smallest user-visible end-to-end slice that touches each required layer.
2. If the task touches React, Next.js, UI review, or transitions, read `docs/agent-skills.md` and load the relevant Vercel skill before editing.
3. Load the `test-driven-development` skill before changing behavior, and prefer a failing test or executable proof before broad implementation.
4. If the slice cannot be executed or validated immediately, shrink it until it can.
5. Implement only that first slice, using thin seams or minimal adapters where needed.
6. Validate it immediately with at least one executable integration or end-to-end path.
7. Stop after the first working slice instead of broadening scope in the same pass.
8. Summarize what works now, what is intentionally thin or stubbed, and the next 2-3 slices to build after feedback.
