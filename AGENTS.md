# AGENTS.md — rules for every agent that works in this repository

Read this file first, in every session. Then read the files in "Read order". Do not start work before you send the receipt in "Your first message".

## What this project is

tensquads is a SaaS product. A small business runs its operations through a squad of AI agents. One master agent coordinates them. The product is designed, screen by screen, in a design canvas. Your job is to build the system from that design, exactly. You do not design. You do not invent. When something is not in the design or in the plan, you ask.

## The three sources, in order of authority

1. `design/` — the design files. The design is the source of truth. Every pixel value, colour, radius, font size, text string, data field and behaviour comes from here. `design/MANIFEST.json` names the canvas version. `node scripts/design-check.mjs` proves the copy matches the canvas. Never edit a file under `design/`. If the check fails, stop and ask Moe to pull the canvas again.
2. `docs/PLAN.md` — the build plan. It holds the decisions table. Every decision there is final. Decisions 1 to 34 answer every open question in the brief. If a decision and the design disagree, the design wins for what a screen shows, and the decision wins for how the system is built. Decisions 33 and 34 are the exceptions: Moe changed what the screens show, so there the decision wins. If you cannot tell which applies, ask.
3. `docs/BRIEF.md` — the original build brief. It holds the screen list, the data model, the behaviour list, the design tokens and the definition of done. Where the brief and the design disagree on a word (for example "agents" against "squads"), the design wins. Report the difference in your pull request; do not fix it.

## Read order, every session

1. `AGENTS.md` (this file)
2. `docs/PLAN.md`, the "Decisions" table in full
3. The task file you were given under `tasks/`
4. The design file the task names, in full, and its inventory under `design/inventory/`
5. `docs/BRIEF.md`, the sections the task names
6. `progress.md`, the last twenty lines

Do not skim. A design file is read in full, including the script at the bottom. The script holds the mock data and the behaviour.

## Your first message is a receipt, not work

Before you write any code, send one message with:

1. The files you read, each with its SHA-256 hash.
2. The output of `node scripts/design-check.mjs`.
3. The line "Decisions 1 to 34 read. No question." Or, if you have a question, a numbered list. Each question has a recommended answer. Then stop and wait.
4. Any line in the brief or the design that you cannot map to a task, with the file and the line.

Moe answers, or says "go". Then you start.

## How you work

- One task, one branch, one pull request. The branch name is the task file name.
- Build in the order of the task file. Do not start the next screen before the current one passes the done checklist.
- Reproduce every visible text string exactly as written in the design. Placeholders in square brackets, such as `[CUSTOMER QUOTE]`, stay as they are.
- Use the design tokens and nothing else. No other colour, font, radius or shadow. No component library whose defaults show through.
- A control that does nothing in the design does nothing in the build. List it in the pull request under "Does nothing, by design".
- A number the design computes, the system computes. Never store a sum, an average or a percentage.
- Seed data comes from the design's mock data, word for word. The seed tests check the numbers in the done checklist.
- Write in Simplified Technical English: short sentences, one idea per sentence, active voice, plain words. This applies to code comments, commit messages, pull requests and questions.

## When you must stop and ask

Stop and ask Moe, in a numbered list with a recommended answer for each item, when you find:

- A state the design does not show: an empty list, an error, a loading state. Decisions 8, 25 and 26 cover the three known ones. Any other is a question.
- A conflict between two design files.
- A style value in the design that is not in the token list.
- A reason to reopen one of the 34 decisions.
- Anything the task file does not cover.

Never guess. Never design. A guess that looks right is still a fault.

## What "done" means

A screen is done only when all of these pass. Report the evidence in the pull request, not a summary.

- [ ] A screenshot of the built screen at 1440 px wide, next to the design at 1440 px. No visible difference in layout, spacing, colour or text. Both images attached.
- [ ] Every behaviour line for the screen in `docs/BRIEF.md` is one Playwright test. All pass in CI.
- [ ] The built screen's inventory (run `scripts/design-inventory.mjs` on the built HTML) has the same texts, handlers and loops as the design's inventory.
- [ ] Computed numbers match the design values with the seed loaded: Accounts 9, Agents 66, Squads 17, Monthly recurring $1,294, All-time value $14,568, Tasks done by agents 331, Agent images 7, Open bugs 8, Features requested 15.
- [ ] Tab reaches every control. Every icon-only button has an `aria-label`. Every input has a label. The focus ring is 2 px `#0169cc` with a 2 px offset.
- [ ] At 390 px wide there is no horizontal scroll, except inside the designated table boxes.
- [ ] `make verify` returns 0.

"It looks right" is not evidence. Exit code 0 is.

## The three roles

- **Planner** writes task files under `tasks/`. It reads the plan, the brief and the design. It does not write code.
- **Builder** takes one task file and builds it on a branch. It pushes with `git push no-mistakes`, never to `origin` directly.
- **Reviewer** takes the pull request, the design file and the done checklist. It does not read the builder's notes. It tries to find faults: pixel difference, missing text, wrong number, broken keyboard path, horizontal scroll at 390 px. For each checklist item it writes the evidence it looked at. "No fault found" with no evidence is itself a fault. The reviewer does not review the architecture. The architecture is fixed by the decisions table.

## Skills

Skills live under `.agents/skills/` (also at `.claude/skills/`). Load a skill before the work it covers. The ones that matter most: `statechart` for every state model, `tdd` and `prove-it-works` for the builder, `model-the-domain` and `boundary-discipline` for the domain areas and the interfaces, `stripe-projects` for service setup.

## Progress

`progress.md` is append-only. Add one line per merged pull request: the date, the task, what was learned. The commit hook rejects edits to earlier lines.

## Git

Author: Moe Ghashim <mohanadgh@gmail.com>. Repository: `moeghashim/tensquads`. Sign every commit with a `Signed-off-by` trailer (DCO).

<!-- stripe-projects-cli managed:agents-md:start -->
## Stripe Projects CLI

This repository is initialized for the Stripe project "tensquads".

## Tools used

- [Stripe CLI](https://docs.stripe.com/stripe-cli) with the `projects` plugin to manage third-party services, credentials, and deployments for this project. Use the stripe-projects-cli to manage deploying and access to third party services.
<!-- stripe-projects-cli managed:agents-md:end -->
