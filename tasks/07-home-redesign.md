# Task 07: Homepage redesign

Branch: `07-home-redesign`. One pull request. Two parts: a design that Moe approves, then the build. Part 1 can start now. Part 2 starts after task 06 is merged, because the build uses `packages/squadmates`. Read `AGENTS.md` first and send the receipt.

## Goal

Screen 1 gets a new design with an inspiring hero. Decision 34 in `docs/PLAN.md` governs this task. The page keeps what it does: the New and Existing toggle, the prompt box, the agent cards, how it works, control, pricing, the call to action, and the path to sign-up. `make verify` returns 0.

## Read

- `docs/PLAN.md`: Decisions (all, decisions 33 and 34 most of all)
- `design/Home.dc.html`, in full: the current copy and behaviour
- `apps/web/src/screens/home/`, in full
- `.agents/skills/impeccable/SKILL.md` and the references it names

## Part 1: the design

1. Add this task file in the first commit. Install the impeccable skill from https://impeccable.style into `.agents/skills/impeccable`. `.claude/skills` is a link to that folder. Record the source and version in `docs/skills-sources.md`.
2. Run impeccable on screen 1. Keep the product truth: the copy, the plans, the prices and the controls. Apply decision 33 in `docs/PLAN.md` to the homepage text; see task 06, step 8, for the string replacements. The hero must be inspiring: the squad of squadmates at work, led by Petra. Use the squadmates from `packages/squadmates`. Do not invent new characters.
3. A new colour, font or shadow is allowed only on this page, and only when the design uses it. List each new token in the pull request.
4. Save the design as `docs/designs/home/home.html`, with screenshots at 1440 px and 390 px. Deploy it to `https://10squads.com/review/home` with the review build.
5. Stop. Moe approves the design or asks for changes. Do not start Part 2 before the approval.

## Part 2: the build

6. Build the approved design in `apps/web/src/screens/home/`. Every control does what it does today.
7. The approved design is the reference for screen 1 now, not `Home.dc.html`. Compare the build with it at 1440 px and 390 px, and attach both images.
8. Keep the behaviour tests for screen 1. Change a test only where the approved copy changed, and list each change.
9. Rebase on `main` last. Append one line to `progress.md` with the commit script.

## Done when

- [ ] Moe approved the design in `docs/designs/home/`
- [ ] The build matches the approved design at 1440 px and 390 px
- [ ] Every control on screen 1 works as before, and the sign-up path works
- [ ] Tab reaches every control, the focus ring is 2 px `#0169cc` with a 2 px offset, and at 390 px there is no horizontal scroll
- [ ] `make verify` returns 0

## Do not

- Do not change a price, a plan or a promise in the copy without Moe's approval.
- Do not change another screen.
- Do not edit any file under `design/`.
