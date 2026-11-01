# Task 03 — Super admin (phase 3)

Branch: `03-super-admin`. One pull request. One builder agent. Read `AGENTS.md` first and send the receipt.

Do not start until phase 2 is merged and passes its check. This task uses the workspace frame, the sidebar and the `AccountScope` lookup from phase 2. If phase 2 is not on `main`, stop.

## Goal

A super admin signs in with Clerk and sees screens 9 and 10 under the "Platform admin" sidebar, with no chat dock. A click on an account row opens that account's workspace through a special session. An account owner cannot reach these screens. The system computes every total from the full list and stores none of them. The Image release state model passes TLC. The final report exists. `make verify` returns 0.

## Read

- `docs/PLAN.md`: Decisions (all), Architecture ("Many accounts in one database", "Where the data lives", "How updates reach running agents"), State models (Image release), How the AI agents work ("Progress and proof"), Phases (phase 3)
- `docs/BRIEF.md`: Screens and routes (screens 9 and 10, Shells, Who sees what), Data model (Account, Agent image, Bug, Feature request), Behaviour (Super-admin: accounts, Super-admin: agent images), Design tokens, Definition of done
- `design/Accounts.dc.html`, `design/AgentImages.dc.html`: in full. Each is a thin wrapper that mounts `Main` with `start-view="admin"` or `start-view="catalog"`. Their inventories are empty
- `design/Main.dc.html`: lines 13-23 (hover and focus rules), 24-61 (frame and admin sidebar), 64-69 ("All companies" link), 115 (main panel), 117-358 (both screens), 1004-1045 (accounts, images, starting state), 1198-1202 (`pill`, `go`, `navStyle`), 1320-1419 (all the logic)
- `design/inventory/Main.json`: the entries for the lines above
- `apps/web/src/design/OVERRIDES.md`
- `packages/domain/src/scope.ts`, `packages/domain/src/platform/`, `packages/domain/src/catalog/`, `packages/adapters/src/neon/repositories.ts`, `packages/adapters/src/neon/save.ts`
- The Clerk docs for the TanStack Start SDK: organizations, roles, `auth()` and `has()`. The `sp-clerk` skill
- Skills: `statechart`, `tdd`, `principle-prove-it-works`, `principle-boundary-discipline`, `tensquads-verify`

## Routes

| Route | Design | Notes |
| --- | --- | --- |
| `/admin` | `Accounts.dc.html` (`Main` with `start-view="admin"`) | Screen 9. Needs the super-admin role |
| `/admin/images` | `AgentImages.dc.html` (`Main` with `start-view="catalog"`) | Screen 10. Needs the super-admin role |

The workspace routes do not change. A row click opens `/overview`, as `open: go('overview')` does in the design.

## Steps, in order

1. Add this task file in the first commit. Add the answers to the items under "Stop and ask" to this file, as task 01 does.
2. **Moe's Clerk dashboard login is needed for this step.** The builder cannot do it. Ask Moe to do these on the development instance, and to tell you the organization id. Do not continue without them.
   - a. Turn on Organizations.
   - b. Turn off the setting that lets users create organizations. A user-made organization must never give the role.
   - c. Add the role from item 1 under "Stop and ask". The Clerk plan in `.projects/state.json` is `hobby`. Moe checks that this plan permits the role.
   - d. Make one organization for our company. Add Moe's Clerk user to it with the role. Moe says which email is the super admin.
   - e. Do the same on the production instance when one exists. Report this step as open in the pull request if none exists.
3. Put the organization id in the Worker vars and in CI, with the name `CLERK_PLATFORM_ORG_ID`. It is not a secret. Do not print a key.
4. Write the Image release state model in `packages/statecharts/image-release` with the `statechart` skill, before its code. States: Draft, Beta, Stable, Needs attention. Rules that TLC must prove:
   - The attention badge equals the count of "Needs attention" images.
   - "On latest" shows onLatest of deployed, or "Not deployed yet".
   - "Roll out" does nothing in version 1.
   - The later rules, as items 15, 16 and 17 say: an update never changes limits, rules, autonomy or keys; a rollout stops after two failed health checks; every Stable account runs the same version.
   Use the words from the design in the chart. Add a `# model:` comment that names the code. Add the model to the `tensquads-verify` skill. Keep the constants small. A run must take under one minute.
5. Add one server function that answers "is this user a super admin". It reads the Clerk session as item 2 says. It requires both the role and `CLERK_PLATFORM_ORG_ID`. This is the only place that reads the role. It runs on the server on each request. The browser never decides.
6. Build a platform scope in one server module only, after the check in step 5 passes. `scope.ts` says the caller must authorize platform access, and that scope validation is not authentication. Nothing else may build a scope with `mode: "platform"`. Route guards follow item 3.
7. Add the special session as item 4 says. In the one function that turns a request into an `AccountScope`, add this rule: a super admin with a special session gets `mode: "account"` with the target `accountId`. A user who is not a super admin never gets the target. The workspace screens do not change. They see only the scope.
8. Add the computations to the domain as functions with no side effects, one for accounts and one for images. Copy the logic in `Main.dc.html` lines 1320-1419, one line at a time. Unit test them first with the table under "Done when". Use the repositories for the data. Do not add a stored total, a cached total or a column for a total.
   - The "Tasks done, 7d" tile sums `account.tasks` and gives 4,765. `PlatformTotals.tasksDone` sums agent rows and gives 331. Do not use `tasksDone` for this tile.
   - `mission` shows `[MISSION NOT SET]` when the stored value is empty, as `||` does at line 1363.
   - Search is the design's join of name, owner and email, trimmed and in lower case.
   - The bar height, the labels and the plan percentages use the design's formulas. "1 companies" and "1 images need attention" stay as the design makes them.
9. Build the admin frame: the "Platform admin" nav, "Companies", "Squad images" with its attention badge, the "Coming next" list and the footer. Share the frame and `main` panel with the workspace. Do not render the chat dock. Pass the footer the values from item 7.
10. Build screen 9 at `/admin`. Pass the done checklist before the next screen.
11. Build screen 10 at `/admin/images`. `imgSel` starts at `support`. A filter that hides the selected row does not change the detail panel, as in the design. "Roll out <nextVersion>" and "View changelog" have no handler.
12. In the workspace sidebar, show "All companies" only to a super admin. A click ends the special session, then opens `/admin`, as item 4 says.
13. Add Playwright tests in `e2e/`, one file per screen. Each behaviour line is one test:
    - Screen 9: search by name; search by owner; search by email; each status filter (All, Active, Trial, Paused); totals do not change when a filter or a search is on; bars count `createdWeek` 0 to 7 and skip -1; "No companies match that search."; a row click opens that account's workspace as that account.
    - Screen 10: each filter (All, Needs attention, With bugs, With requests); a row click fills the detail panel; "On latest" for Support shows `22 of 34 (65%)`; "On latest" for People shows `Not deployed yet`; the sidebar badge shows 2; "No open bugs on this version." for Marketing; "Roll out 2.1.1" and "View changelog" change nothing.
    - Both screens: nav highlights the current page; no chat dock.
    - Access: no session goes to `/signin`; an account owner cannot reach `/admin`, `/admin/images` or their data through the server functions; an owner never sees "All companies"; an owner who sets the special session by hand still sees only their own account; a super admin who opens Northwind Apparel sees no Demo store data; "All companies" returns to `/admin` and ends the session.
    The test makes its own Clerk users in test mode and removes them. The super-admin test user has the name Moe Ghashim, so the footer matches the design.
14. Load the seed in the test database before the admin tests. Run them in their own Playwright project, one at a time, so a sign-up test cannot change the count of 9 accounts. `saveWorkspace` deletes every row, so read item 21 first.
15. Add the screenshot comparison at 1440 px and the 390 px check for both screens, with the method task 01 uses. Inside the table boxes the horizontal scroll stays: `min-width: 1360px` and `min-width: 720px`.
16. Add the inventory comparison as item 18 says.
17. Deploy to the Cloudflare preview. Apply the migration to the Neon database in `.env`. Check that `/admin` and `/admin/images` send a visitor with no session to `/signin`.
18. Write the final report at the path in item 20. It lists: each decision 1 to 28 and its answer; each control that does nothing, from all merged pull requests and this one; each approved difference from the design, and who approved it. Include each word difference below. Nothing else can ship as a difference.
19. Append one line to `progress.md` with the commit script.

### Report these differences in the pull request and the final report

The design wins for what a screen shows. Do not change the design, the plan or the brief.

- The brief says "Accounts", "All accounts" and "Agent images". The design says "Companies", "All companies" and "Squad images". The design also keeps "accounts" in `aria-label` values, in the `<title>` of each wrapper, and in "34 accounts" and "reported by 5 accounts".
- The brief says 8 tiles. The design has 6 on screen 9.
- The brief shows "2 squads · Wholesale, Retail" in the table. The design shows the mission and no squad names.
- The brief says "All-time value". The tile says "All-time company value". The column says "All-time value".
- The plan and the brief say only a super admin sees the link. The design shows it to everyone. The build follows the plan, because this is who sees what, not what a screen shows.
- Decision 12 names the admin footer for the product name. The design's admin footer has no product name.

### Does nothing, by design

"Roll out <nextVersion>" and "View changelog". The "Coming next" items are plain text and are not controls: "Usage and billing", "Platform health", "Admin users".

## Done when

- [ ] Every item under "What done means" in `AGENTS.md` passes for `/admin` and `/admin/images`, with evidence
- [ ] The values below show on screen with the seed loaded, proved by unit tests and e2e tests
- [ ] No table or column stores a total. The reviewer checks the diff of `schema.ts` and `migration.sql`
- [ ] An account owner cannot reach an admin route or an admin server function, proved by tests
- [ ] A special session gives the target account's scope to a super admin and to nobody else, proved by tests
- [ ] A row click opens that account's workspace. The test proves no other account's data shows
- [ ] `packages/statecharts/image-release/chart.mmd` exists and TLC reports no broken rule
- [ ] The final report exists, and it lists all 28 decisions
- [ ] The nine seed numbers still pass, including Tasks done 331
- [ ] Moe's steps in step 2 are done, or listed as open in the pull request
- [ ] `node scripts/design-check.mjs` returns 0
- [ ] `make verify` returns 0 on the branch and in CI

### Values with the seed loaded

| Done number | Design label | Value | Where it shows |
| --- | --- | --- | --- |
| Accounts | Companies | 9 | Tile |
| Agents | Squads | 66 | Tile. See item 8 |
| Squads | None | 17 | Not on any screen. See item 8 |
| Monthly recurring | Monthly recurring | $1,294 | Tile |
| All-time value | All-time company value | $14,568 | Tile |
| Agent images | Images | 7 | Tile |
| Open bugs | Open bugs | 8 | Tile |
| Features requested | Features requested | 15 | Tile |

Other computed text on screen 9: `+1 in the last 2 weeks`; Active companies 6, `2 on trial · 1 paused`; `53 online right now`; `53 squads online now`; Tasks done, 7d 4,765; `6 paying companies`; `Avg $2,081 per paying company`; `All companies (9 of 9)`; week counts 0, 0, 0, 1, 0, 1, 0, 1; Starter `3 companies · 7 squads` 33%; Growth `4 companies · 27 squads` 44%; Scale `2 companies · 32 squads` 22%; `Average of 7.3 squads per company`.

Other computed text on screen 10: `3 stable · 2 beta or draft`; Deployments 127, `16 behind the latest version`; `2 high severity`; `3 in progress`; Updated this week 4, `of 7 images`; `2 images need attention`; `All images (7 of 7)`.

## Stop and ask

Send these in the receipt, as a numbered list. Each has a recommended answer. Wait for the answers. Also stop and ask for any state this file does not cover.

1. **Which Clerk role is the super admin?** Decision 2 says an organization role and gives no name. Recommended: a custom role `org:super_admin` in one company organization. If the `hobby` plan does not permit a custom role, use the default `org:admin` in that one organization. The check always includes the organization id, and users cannot create organizations.
2. **How does the server read the role?** A Clerk session has a role only when an organization is active, and an owner's sign-in does not set one. Recommended: the sign-in sets the company organization as active when the user is a member, and the server reads the session with `has()`. This makes no Clerk API call on each request. Read the Clerk docs and tell Moe if this does not work.
3. **Where does each user go?** The plan says a correct sign-in opens Overview. A super admin may own no account. No design exists for a refused page. Recommended: a super admin with no special session goes from `/overview` to `/admin`. An account owner who opens `/admin` goes to `/overview`, with no new text. A visitor with no session goes to `/signin`.
4. **What form does the special session take, and when does it end?** The plan says only that it carries the target `account_id`. Recommended: one HttpOnly, Secure, SameSite=Lax cookie that holds the account id. A POST server function sets it after the check in step 5. The server repeats the check on each request and ignores the cookie for any other user, so the cookie needs no signature and no new secret. The account id must exist. It ends on "All companies", and after one hour. The design has no sign-out control, so add none.
5. **What can a super admin do in the special session, and what is recorded?** The brief says "as that account". The data model has no audit table. Recommended: the same writes as the owner, since the workspace sees no difference. Send the existing `account.opened` event through the Kernel. Add no table.
6. **What does a row click open for an account with no workspace data?** The seed has agents, events, rules and approvals only for Demo store. The other eight accounts have none. The design's `go('overview')` opens one view, and the design text says "In this demo every company opens the same workspace." The brief says the row opens that account's workspace. Recommended: the session always carries the clicked account. Never fall back to Demo store. The eight accounts show the phase 2 workspace with empty lists and no new text, tiles "—" as in decision 25, and `Runs <agents> squads · <name>` from the account row. The design text stays word for word, and the report lists that it is no longer true.
7. **Whose name shows?** The design has "Moe Ghashim" and "MG" as fixed text. Recommended: the admin footer shows the Clerk user's name and initials. In a special session the workspace footer shows the target account's `owner`. For Demo store this is the design's text.
8. **Where does Squads 17 show, and which tiles?** The done list needs Agents 66 and Squads 17. The design's tile labelled "Squads" shows 66 (`totalAgents`), and the design computes `totalSquads` but never shows it. The brief says 8 tiles, and the design has 6. Recommended: build the 6 tiles as the design. The "Squads" tile shows 66. Prove 17 with the repository test only, and add no text.
9. **Are `agents`, `online` and `tasks` on the account row stored?** They are stored fields in the design and in the seed. Eight accounts have no agent rows to count. An approve in Demo store changes Overview to 332 while its row stays at 331. Recommended: keep them as stored per-account fields, because the design reads them and does not compute them. The totals are still sums on each request. Report the difference.
10. **What about "+9% vs last week"?** The design has it as fixed text. No weekly history exists to compute it. Recommended: keep the fixed text, because "Figures are demo data." stays on the screen. List it in the final report.
11. **What about the dated values?** `createdWeek`, the week labels "Sep 7" to "Oct 26", `lastActive`, `updated`, `updatedFull` and `age` are fixed in the design. "Updated this week" reads the `updated` text. Dates from today would change the screen and break the screenshot. Recommended: keep the stored values and the design's logic. List it in the final report.
12. **How does a new sign-up show in the table?** Phase 1 writes `createdWeek` 0, which is the oldest bar, an empty `lastActive`, the email as `owner`, and `sort_order` 0. Recommended: write `createdWeek` 7 and `lastActive` "Just now", and put the new account last in the order. Keep the email as `owner`, because sign-up collects no name.
13. **Which states have no design on these two screens?** Loading; a failed load; zero accounts (the plan percentages divide by zero); zero images (the detail panel has no image); an image filter with no rows. Recommended: no loading state, because the route loader runs before the first paint. A failed load goes to the existing root error handling, with no new text. Zero accounts and zero images are not reachable, so build nothing for them. An image filter with no rows shows the header row only.
14. **"Nothing requested yet." cannot show with the seed.** All seven images have a feature request. Recommended: build it, and prove it with a component or unit test and no change to the seed.
15. **What moves an image into and out of "Needs attention"?** The design stores the status, and no control changes it. Recommended: in the model, Stable and Needs attention move both ways with no named cause. Do not derive the status from bugs. The code reads the stored status.
16. **The rule "every Stable account runs the same version" does not hold for the seed.** Orders is Stable at 29 of 31. Recommended: write the rule as "when no rollout is running". Keep the seed.
17. **How much of rollout is in this phase?** The plan says "Later" for three rules and says they become invariants. It also says the Rollout object adds to the build and that "Roll out" leaves the do-nothing list in phase 4, while phase 4 says screens 1 to 10 do not change. Recommended: put the rollout rules in the model as abstract steps. Add no Rollout object and no code. `makeTemplate` and `startFromTemplate` already exist on `MachineProvider`. "Roll out" stays a control that does nothing. Report the phase 4 conflict to Moe.
18. **What does the inventory check compare?** `design/inventory/Accounts.json` and `AgentImages.json` are empty, and `Main.json` is not split by screen. Recommended: compare with the `Main.json` entries for these screens. Handlers: `goAdmin`, `goCatalog`, `adm.onQuery`, `f.pick`, `r.open`, `r.pick`. Loops: `adm.kpis`, `adm.bars` (two), `adm.plans`, `adm.filters`, `adm.rows`, `cat.kpis`, `cat.filters`, `cat.rows`, `img.bugs`, `img.features`. Write the list in the test.
19. **Which page title?** The wrappers say `All accounts` and `Agent images`. `Main.dc.html` says `tensquads workspace`. Recommended: use the wrapper titles, word for word.
20. **Where does the final report go, and when?** The plan says when screen 10 merges, in phase 3. The brief says when all ten screens pass. Recommended: `docs/final-report.md`, in this pull request, after phases 1 and 2 are merged. Give each difference an "Approved by" entry. Update it in the pull request of any later phase that adds a difference.
21. **May the seed run on the Neon database in `.env`?** `saveWorkspace` deletes every row before it writes. A run there removes real sign-ups. Recommended: seed only the CI database in the tests. Moe says yes or no before any seed runs on the preview database.

## Do not

- Do not store a total, an average or a percentage.
- Do not build a screen for "Coming next", a refused page, a sign-out control or an audit screen.
- Do not wire "Roll out" or "View changelog".
- Do not add a Rollout object, a Durable Object, a bus adapter or the boat.dev adapter. That is phase 4.
- Do not add the proof-of-concept account or its two images to the seed. That is phase 5, and it changes the counts.
- Do not add a text string, colour, font, radius or shadow beyond this file and the design.
- Do not call `saveWorkspace` on a database with real accounts without Moe's yes.
- Do not change anything under `design/`.
- Do not edit `docs/PLAN.md` or `docs/BRIEF.md`. Report each difference in the pull request.
