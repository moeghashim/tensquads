# Task 01 — Public screens (phase 1)

Branch: `01-public-screens`. One pull request. One builder agent. Read `AGENTS.md` first and send the receipt.

## Goal

The homepage, sign-up and sign-in work. They match the design at 1440 px and 390 px. A new user makes an account in Neon and reaches a signed-in page. A returning user signs in and reaches the same page. `make verify` returns 0.

## Read

- `docs/PLAN.md`: Decisions (all), Architecture, State models (Sign-up), Phases (phase 1)
- `docs/BRIEF.md`: Screens and routes (Homepage, Sign up), Behaviour (Homepage, Sign-up), Design tokens, Definition of done
- `design/Home.dc.html`, `design/Onboarding.dc.html`, `design/SignIn.dc.html`: in full, with the script at the bottom
- `design/inventory/Home.json`, `design/inventory/Onboarding.json`, `design/inventory/SignIn.json`
- `apps/web/src/design/OVERRIDES.md`
- The Clerk docs for the TanStack Start SDK and Clerk elements

## Moe's answers, 1 November 2026

These three answers fill gaps in the design. They are final for this task. List them in the pull request.

1. **Account step.** The design collects no email or password. After the Squads step, "Create my workspace" shows an email and password form. It reuses the form from `SignIn.dc.html`: the same tokens, the labels "Email" and "Password", and the placeholders `you@company.com` and `Your password`. It adds no new text and no fourth step in the step row. The button reads "Create my workspace". Back returns to the Squads list. Empty fields show "Enter your email and password to sign in." Clerk makes the user. Then the system makes the account.
2. **Phase 2 links.** `/overview` and `/chat` exist as blank pages that need a session, as the blank page did in phase 0. A visitor with no session goes to `/signin`. Phase 2 fills these pages.
3. **Wrong password.** When Clerk rejects a sign-in, show "That email or password is wrong." in the same place and style as the existing error. This is the only new text in this task. "Forgot password?" and "Email me a sign-in link" do nothing, as their `#` links do in the design. List them under "Does nothing, by design".

## Orchestrator decisions

These decisions cover states the design does not show. They are final for this task. List them in the pull request. Moe's three answers above stay as written.

1. Verify at sign-up is off in the Clerk development instance. Add no code screen.
2. Device Trust is off in the Clerk development instance. Add no code screen. If `needs_client_trust` still appears, show "That email or password is wrong." The screen must never leave the user with no message.
3. An email already in use shows "That email or password is wrong." in the same alert.
4. A sign-up password that Clerk rejects shows "That email or password is wrong." in the same alert. Tests use a password of at least 16 characters.
5. A failed create shows "Something went wrong. Try again." in the same alert. The screen stays on the account form. A retry makes no second account.
6. A request in flight adds no new text. The button keeps its label and is disabled, so a double click sends one request.
7. Values the account form does not collect stay the receipt defaults: status Trial, plan Starter, mrr 0, ltv 0, owner equal to the email, tint `#e7efff`, squad name equal to the business name, and master name "Master". The limit defaults are the design seed in `Main.dc.html`: refund without asking 50, total ad spend per day 200, and reorder without asking 500.

Verify at sign-up and Device Trust are off in the development instance only. A production instance must turn both on, and that needs a designed code step before launch.

## Routes

| Route | Design | Notes |
| --- | --- | --- |
| `/` | `Home.dc.html` | Replaces the blank page |
| `/signup` | `Onboarding.dc.html` | `Home.dc.html` "New" and "Existing" do not start a step. Start at the Business type step |
| `/signin` | `SignIn.dc.html` | Decision 13: Clerk elements, no Clerk hosted page |
| `/overview` | None | Answer 2 |
| `/chat` | None | Answer 2 |

Map every `.dc.html` link to its route. `Main.dc.html` becomes `/overview`. Footer `#` links stay `#`.

## Steps, in order

1. Add this task file in the first commit. Fix `scripts/test/worker-bundle.test.mjs` first: the guard must also catch a third-party package that reads a file at import time. The Worker imports the adapter in this task.
2. Add the Clerk SDK for TanStack Start, pinned. Set the Clerk and Neon Worker secrets with `wrangler secret put`, by piping each value from `.env`. Do not print a value. Read the Clerk development keys from `CLERK_ENVIRONMENTS` in `.env`.
3. Build screen 1, the homepage. Build the public nav and footer as design shows. Pass the done checklist before the next screen.
4. Build the sign-in screen. Use Clerk elements with the design tokens only. No Clerk default style may show. A correct sign-in opens `/overview`.
5. Build screen 2, sign-up. It uses the seven agents in the design, not the five in the brief. Where the brief says "agents" and the design says "squads", the design wins. Report each difference.
6. Add the account step from answer 1, and the create path. One create makes one account, one squad, N agents, one master, and default limits, in one database transaction. The account belongs to the Clerk user. Add the owner column with a Drizzle migration. A repeat request for the same Clerk user must not make a second account. All the data access uses `AccountScope` through the domain repositories. Then open `/overview`.
7. Write the Sign-up state model in `packages/statecharts/signup` with the `statechart` skill. States and rules are in `docs/PLAN.md` "State models". Add the account step as a state. TLC must report no broken rule. Add it to `npm run statechart:check` and to the `tensquads-verify` skill.
8. Add Playwright tests. Each behaviour line for these screens in `docs/BRIEF.md` is one test. Add a test for each answer above. Add one e2e test: a new user signs up, an account row exists in Neon, and `/overview` opens. CI uses the secrets `TEST_DATABASE_URL`, `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. The database behind `TEST_DATABASE_URL` is empty; the test applies the migration. Use Clerk test mode. The test removes its own Clerk user and its account row.
9. Wire these secrets into CI. A Dependabot pull request gets no secrets. Only in that case, skip the tests that need them, and print that they were skipped. In every other case a missing secret is a failure.
10. Add the Screenshot comparison at 1440 px and the 390 px check for each screen. Run the inventory comparison for each screen.
11. Deploy to the Cloudflare preview. Apply the migration to the Neon database in `.env`. Check that the preview returns 200 for `/`, `/signup` and `/signin`.
12. Append one line to `progress.md` with the commit script.

## Done when

- [ ] Every item under "What done means" in `AGENTS.md` passes for `/`, `/signup` and `/signin`, with evidence
- [ ] The Worker bundle guard catches a third-party package that reads a file at import time
- [ ] A new user makes one account in Neon, proved by the e2e test in CI
- [ ] A repeat create makes no second account, proved by a test
- [ ] A correct sign-in opens `/overview`. A wrong password shows the answer 3 text
- [ ] `/overview` and `/chat` send a visitor with no session to `/signin`
- [ ] `packages/statecharts/signup/chart.mmd` exists and TLC reports no broken rule
- [ ] The seed tests still pass with the nine numbers
- [ ] The preview returns 200 for all three public routes
- [ ] `node scripts/design-check.mjs` returns 0
- [ ] `make verify` returns 0 on the branch and in CI

## Stop and ask

Stop and ask, in a numbered list with a recommended answer for each item, for any state the design does not show that this file does not cover. Examples: a Clerk step that needs an email code, an email already in use, a password Clerk rejects, a failed create, a loading state.

## Do not

- Do not build any workspace screen. That is phase 2.
- Do not build the super-admin role. That is phase 3.
- Do not replace the stored `success` value or add the metrics table.
- Do not add a text string, colour, font, radius or shadow beyond this file and the design.
- Do not change anything under `design/`.
- Do not edit `docs/PLAN.md` or `docs/BRIEF.md`. Report each difference in the pull request.
