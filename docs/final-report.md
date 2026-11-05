# Final report

Screen 10 is in this pull request. Phases 1 and 2 are already on main. Each difference below has an approval. Nothing else ships as a difference from the design.

Pull request 12 is merged, 3 November 2026. This report includes it.

## Decisions

| # | Answer |
| --- | --- |
| 1 | TanStack Start 1.0 (React, Vite) on PI-Starter's tooling. A cordis core in `packages/`. Drizzle. Neon Postgres. Cloudflare Workers through the Cloudflare Vite plugin. Changed from Next.js on 31 October 2026. |
| 1b | Stripe Projects sets up Cloudflare, Neon, and Clerk. boat.dev is set up by hand. |
| 1c | Each agent runs on one boat.dev machine. Version 1 uses a test adapter with the same interface. |
| 2 | Clerk, through Stripe Projects. A super admin is a Clerk organization role. There is no second sign-in. |
| 3 | One Neon database. Each account row has an `account_id`. The data layer applies that rule. A super admin opens an account with a special session. |
| 4 | Test agents. `send()` and `nextEvent()` from the design run behind the real interfaces. Version 1 has no AI model and no real machines. |
| 5 | External services are placeholders. The design has no screen for "connect on the next step". That step does nothing and opens Overview. |
| 6 | The system records plans and the trial. Version 1 does not charge money. |
| 7 | A second squad is not in the screens. The data model permits many squads per account. |
| 8 | Empty, loading, and error states are listed when found. Moe decides for each screen. The agent does not design them. |
| 9 | The screens stack at 390 px, as the design does. |
| 10 | `[CUSTOMER QUOTE]` and the other placeholders stay as written. |
| 11 | Controls that do nothing stay as controls that do nothing. This report lists them. |
| 12 | The repository is `moeghashim/tensquads`. The product name is tensquads: package scope `@tensquads`, app title, and the places the design names. The code does not use "10Squads" or "Business Agents". The admin footer follows the design and has no product name. See the differences below. |
| 13 | Clerk elements, styled with the design tokens. No Clerk hosted page. `/signin` is the sign-in screen. |
| 14 | The Cloudflare account that Stripe Projects links for this app. |
| 15 | Moe's boat.dev account, with a new environment `tensquads-agents`. |
| 16 | Cloudflare Queues carry the messages. One Durable Object per account orders them and applies the state writes. Neon holds the record. The Durable Object is the only writer to the bus tables. Version 1 uses an in-memory bus behind the same EventBus interface. |
| 17 | The master core runs on Cloudflare as the account's Durable Object and a Worker. It never depends on a boat.dev machine. A boat.dev machine is only for work that needs a full computer. Agent machines run always on, size small, with a heartbeat to the Durable Object. |
| 18 | An agent image is ours. The account state is the customer's and never lives on the machine. A skill update is a bus message and a cordis plug-in swap, with no restart. An image update starts a new machine from the new template, checks it, then switches. Rollout goes Draft, Beta, Stable. No customer may pin a version. Everyone moves to Stable. |
| 19 | TypeSafe Jev is not used in version 1. A Decider interface is in the core with no adapter. Later, the first adapter uses the main model with structured output. A Jev adapter may replace it when the service is open and a test shows it is faster and as correct. |
| 20 | Each agent runs one loop: take a task, plan, run skills through their gates, collect evidence, send a Result. Every task carries a check that code runs. The master core runs the check. A task is done only when the check passes. The agent never grades its own work. |
| 21 | The proof of concept is phase 5, after the machines and bus adapters. Three squads: master, Market researcher, Website builder. Confirmed by Moe on 31 October 2026. |
| 22 | One landing page on `<slug>.10squads.com`, published through Cloudflare Pages. |
| 23 | Web search finds competitors. The Scrapling service on boat.dev reads their pages. The model analyses offer, price, positioning, and gaps. |
| 24 | OpenAI, with an API key from Moe, kept in the boat.dev key proxy. Market researcher and Website builder are on the homepage cards and sign-up step 3. |
| 25 | For an account with no store, the Revenue and Orders tiles show "—". The layout does not move. |
| 26 | The site preview is a link in the chat only. No new screen or panel. |
| 27 | Market researcher `#fde2f3`. Website builder `#e5e9f0`. |
| 28 | The business type is restaurants or grocers. A restaurant gets a menu page. A grocer gets a one-page list of the items. |
| 29 | Dropped. Moe dropped this decision on 1 November 2026. |
| 30 | Dropped. Moe dropped this decision on 1 November 2026. |
| 31 | ClickHouse comes after phase 5 (task 05 text only; no row in PLAN.md). |
| 32 | Four things from dsh-superagent, decided on 2 November 2026. Inbound events use Source, Trigger, and Eval. Each Approval records a Mandate. The agent loop gains Waiting, Blocked, and Dropped. The plan keeps a Rejected concepts table. |
| 33 | Squadmates: names and characters. Decided by Moe on 3 November 2026, in pull request 17. Each agent image has one fixed character name from a famous place: master Petra, Orders Pisa, Support Kyoto, Marketing Rio, Finance Zurich, Inventory Giza, Market researcher Machu, Website builder Angkor, Analytics Delphi, People Sydney. A customer cannot rename the master or an agent. Each agent shows a character: one round body in the agent's colour, one role accessory, and eyes that show the Agent loop state. The reference drawing is `/review/characters`. Where a screen shows the master's name or an agent's mark, the build shows the character name and the character. The design's agent name ("Orders") stays as the role tag. Task 06 builds it. Not built in this pull request. Decision 33 fixes the name for the `hr` image. The reference sheet has no People character. Task 06 says to report that drawing addition for Moe. This report does not approve that drawing. |
| 34 | Homepage redesign. Decided by Moe on 3 November 2026, in pull request 17. Screen 1 gets a new design, made with the impeccable skill, with an inspiring hero that shows the squadmates. Moe approves the new design before it is built. The approved design lives in `docs/designs/home/` and replaces `Home.dc.html` as the reference for screen 1 only. The copy, the New and Existing toggle, the prompt box, the pricing and the path to sign-up stay, unless Moe approves a change. Task 07 builds it. Not built in this pull request. Moe has not approved a new homepage design. |

## Controls that do nothing

These stay as the design or the recorded answer left them.

- Homepage mock "Approve". The design draws a span, not a link. The build has no handler. Pull request 4, merged 1 November 2026. The design is the source.
- Homepage mock "Decline". The design draws a span, not a link. The build has no handler. Pull request 4, merged 1 November 2026. The design is the source.
- Homepage footer "About", "Blog", "Careers", "Contact", "Terms", "Privacy", and "Security" are anchors with `href="#"`. Pull request 4, merged 1 November 2026. The Biome ignore reason is "The design keeps this link as #."
- Sign-in "Forgot password?" is an anchor with `href="#"`. Moe, 1 November 2026, answer 3 in pull request 4.
- Sign-in "Email me a sign-in link" is an anchor with `href="#"`. Moe, 1 November 2026, answer 3 in pull request 4.
- Sign-up says "We'll ask you to connect these on the next step." That step does nothing and opens Overview. Decision 5.
- An empty chat message, or a second send while the first is working, does nothing. Task 02-frame. Pull request 9 records the same rule: a blank trim is ignored, and a second send waits. Merged 2 November 2026.
- A blank action on the new-rule form adds no rule. Task 02-rules. The design's `addRule` does this.
- A rule starts no task. The Rules screen has no delete control and no edit control. Pull request 11, merged 3 November 2026. The design is the source: the rules run no action in version 1.
- The Squads list has no on/off switch. Skill chips are not buttons. Pull request 8, merged 2 November 2026. The design list has no switch. The agent page switch is a real control. Pull request 12, merged 3 November 2026.
- There is no sign-out control. Pull request 6, merged 2 November 2026. The design has none. Pull request 11's account-switch test calls `window.Clerk.signOut()` because the screen has no control.
- "Roll out <nextVersion>" does nothing. On the seed the button reads "Roll out 2.1.1". Moe, 3 November 2026, answer 17 in `tasks/03-super-admin.md`.
- "View changelog" does nothing. Moe, 3 November 2026, answer 17 in `tasks/03-super-admin.md`.
- "Usage and billing", "Platform health", and "Admin users" are plain text under "Coming next". They are not controls. Moe, 3 November 2026, in `tasks/03-super-admin.md`.

Pull request 5 changes Fallow and Biome. It names no product control. Pull request 7 adds holding and review pages and a database per CI job. It names no product control. Pull request 13's traffic screen names no do-nothing control. Pull requests 14, 15, and 16 are landing review pages. They name no product control. Pull request 16 draws nine squadmates and no People character. Pull request 17 records tasks 06 and 07. It builds no control.

Task 04 is not merged. Its controls are not in this list.

## Approved differences

### Pull request 4, merged 1 November 2026

Moe answered these on 1 November 2026.

- After Squads, "Create my workspace" shows an email and password form. The labels are Email and Password. The placeholders are `you@company.com` and `Your password`. The button reads "Create my workspace". Back returns to Squads. Clerk makes the user, then the system makes the account, then the app opens `/overview`. The brief said this button opens Overview at once.
- `/overview` and `/chat` need a session. A visitor with no session goes to `/signin`.
- A rejected sign-in shows "That email or password is wrong."

The orchestrator recorded these in that pull request.

- Verify at sign-up is off. The build adds no code screen.
- Device Trust is off. If `needs_client_trust` still appears, the screen shows "That email or password is wrong."
- An email already in use, and a sign-up password Clerk rejects, use that same sentence. Tests use a password of at least 16 characters.
- A failed create shows "Something went wrong. Try again." The screen stays on the form. A retry makes no second account.
- A request in flight keeps the button label and disables the button. A double click sends one request.
- Uncollected account values stay the receipt defaults, with the design seed limits. Status is Trial. Plan is Starter. `mrr` is 0. `ltv` is 0. The owner is the email. The tint is `#e7efff`. The squad name is the business name. The master name is "Master". Refund without asking is 50. Total ad spend per day is 200. Reorder without asking is 500.
- Design colours stay. Axe excludes only the named elements. The fix for a named fault is a design change.
- Six screenshot checks run on macOS only. The reason is "Baselines are macOS captures. The macOS required job runs this pixel check."
- Workerd is the proof that the Worker boots. Node is a fast filter. The Node allow-list is `async_hooks`, `crypto`, and `stream`.
- Tests may serve a local copy of Inter and JetBrains Mono. The app helmet still loads those families from Google.

Differences from the brief, recorded in that pull request.

- The brief says homepage Sign in opens Overview. Decision 13 and `SignIn.dc.html` send Sign in to `/signin`. A correct sign-in then opens `/overview`.
- The brief says step 3 lists five agents. The design lists seven squads. The build uses seven squads.
- The brief says "N agents and one master will be created". The design says "1 squad and one master squad will be created." for one squad, and "N squads and one master squad will be created." for more than one.
- The brief says "Pick at least one agent to start". The design says "Pick at least one squad to start."
- The brief says "Talk to us" does nothing. The design links that Scale plan control to `Onboarding.dc.html`. The build sends it to `/signup`.
- Two design subtitles still say "agents". They stay: "A sentence or two is enough. The agents fill in the rest with you." and "We use this to pick the right agents and what to connect."
- "See a live demo" goes to `/chat`. A visitor with no session goes to `/signin`.
- Zero squads do not advance. The click adds no new string.
- Homepage "New business" and "Existing business" change the prompt and the chips. They do not start a sign-up step. Sign-up starts at the Business type step.
- The brief green text is `#00692a`. The design online pill is `#008635`. Decision 8 keeps `#008635`.
- The brief open list said the design has no sign-in screen. `SignIn.dc.html` is the design.
- The receipt question used limits 50, 50, and 500. Decision 7 uses the design seed: refund 50, daily ad spend 200, and reorder 500.

Token differences: none.

### Pull request 6, merged 2 November 2026

- The message list has `tabindex="0"` so the keyboard can reach the scrollable region. The design file has no tabindex. The resting screenshots did not change for that attribute. The focus ring is the existing 2 px `#0169cc` rule with a 2 px offset. Approved by the orchestrator under Moe's delegation, 2 November 2026.
- `page-has-heading-one` is disabled only on the blank frame. Later screen tasks add the heading.
- The docs say `cloudflare/worker`. The live slug is `cloudflare/workers`. The plan stays as written. The same sentence is in pull requests 7, 8, 10, 11, 12, and 13.
- The 30 second gate uses the stored absolute `occurredAt`. The displayed clock stays at minute resolution. The server gives up sooner, at 9999 ms per attempt. Decision 17. The orchestrator approved a clock mock for that expiry: "No Moe or project rule forbids it."
- Moe chose one conversation thread id, `dock`. The `main` thread row is removed. The squad id `main` stays a squad.
- A Mandate is made when a person says yes. Pending or Declined has none. Approved has exactly one. The Approve action stayed in a later task.

### Pull request 8, merged 2 November 2026

Task 02-agents requires this report. The design is the source.

- The brief says "Agents". The design heading is "Squads". The page title stays "Agents".
- The design sentence says "sandbox server" (`Main.dc.html:548`).
- The brief names `/app/agents` and `/app/agents/:id`. The frame uses `/agents` and `/agents/$id`.
- The brief names an agent on/off switch. This list has no switch.
- The brief tile "Tasks done by agents" is on Overview. This screen shows each card's tasks.
- A heartbeat state "Restarting" is not on this screen.

Token differences: none.

### Pull request 9, merged 2 November 2026

- Task 02-chat requires this report. The brief says hand-offs "from this chat". The design shows the last six events of the whole bus. The scripted replies say "agent" and "Agents" (`Main.dc.html:1136`, `:1140`, `:1153`). The nav says "Squads".
- The orchestrator approved one scope exception: `e2e/frame.spec.ts:93` expects the Master heading. The blank-page assertion is gone. Pull request 8's Inventory click in the sidebar stays.
- The Task shown while the send is working comes from the begin response. The client does not read the chat list a second time for that row.

Token differences: none.

### Pull request 10, merged 3 November 2026

The pull request records these differences.

- The plan says success is computed. This task keeps the stored success string.
- The plan says agents do not write Neon and the Durable Object is the only bus writer. Version 1 writes the bus event with `appendEvents` and records a spend Mandate with `createMandate`.
- The greeting uses the owner, "Good morning, Moe", not the account name.
- The pill reads "4 of 5 squads online". Revenue is $8,420. Hours are 34h. Tasks done starts at 331, becomes 332 after the refund approval, and reaches 333 when the held chat finish also writes a Result.
- The chart heading is "Revenue, last 14 days". The KPI label is "Tasks done by squads". The brief says "Tasks done by agents". Task 02-overview requires that report.
- Task 02-overview also requires this report: the design inbox holds mission proposals, and the badge counts them, so the seed shows 4.

Token differences: no design token, colour, type size, or font weight was changed to chase contrast. The 66 stored pixels are rounded bubble corners. No threshold, retry, or baseline was changed. The online pill contrast exception stays: `overview-online-pill`.

### Pull request 11, merged 3 November 2026

- The form label says Agent. Other design text says Squads. The label stays Agent. Task 02-rules. The design is the source.
- The route is `/rules`. The brief says `/app/rules`.
- `e2e/frame.spec.ts` expects the Rules page after the Rules click. Approved by the orchestrator under Moe's delegation, 3 November 2026.
- The Monday rule stays off. The model keeps the reorder point at 1 and the reorder limit at $500.

Token differences: none. The sliders keep `accent-color: #181818`.

### Pull request 12, merged 3 November 2026

Moe delegated the build questions in `tasks/02-agent-detail.md`. Each item uses the recommended answer. These decisions are final for this screen. The merged head is `1c6d3d64dc0296d0246d6e1a443474db3c81e882`.

Pull request 12 names no do-nothing control. The agent page on/off switch, the skill switches, and the autonomy picker write through the kernel. The Squads list still has no switch.

- An unknown agent id goes to `/agents`.
- The agent loop model stays out of phase 2.
- The screen shows two status labels. Running is On. Paused is every other state. The test adapter passes Starting and Stopping in one step. The screen does not show "Starting".
- "A skill cannot run when Off" covers `send()` only. `nextEvent()` is a replay.
- All skills off follows the code and uses the first skill. This screen does not change `send()`.
- `accounts.online` stays the stored count. The agent switch does not change it.
- A new account dashboard uses frame item 14. A blank value shows "—". An empty list shows its heading and no rows. The mission text "Pending approval" stays.
- The design says "Squad running", "Sandbox", and "All squads". The brief says agent and machine. The build follows the design. Task 02-agent-detail step 8.
- A session read that needs a new token throws "The session needs a refresh." The browser refreshes that token on GET and then retries the read. A POST does not refresh.
- Clerk accepts a session token only when its `azp` is `https://tensquads.moe-678.workers.dev` or `http://localhost:3000`.
- Agent, chat, traffic, and approval writes take the per-account lock `pg_advisory_xact_lock(1952804468, hashtext(accountId))`. Rules writes already passed the account. `writeAccount`, `deleteWorkspaceAccount`, and `applyMigration` stay on the global exclusive lock.
- Running, skills, and autonomy claim the shared write fence. `askRevise` sends no fence. A superseded write returns the current row. A validation error keeps the retire list. A failed or timed-out write keeps the snapshot, advances the write counter, and reads once. A successful read clears recovery only when it started after the latest failure. A newer write stays ahead of an older arrival.
- Sign-out reloads the workspace, and that loader redirects to `/signin`. While the session stamp differs, the parent renders nothing.
- A start or stop is bounded by `MachineTimeout`. Fairness is only that timeout, the refresh timeout, and the mark-late timeout, each alone.
- The chat finish stays the one already on main.
- The docs say `cloudflare/worker`. The live slug is `cloudflare/workers`. The plan stays as written.

Token differences: none. TLC on the agent on/off model reached 296 states and 1974 steps. The chart draws 10 states and 37 arrows.

### Pull request 13, merged 2 November 2026

Moe delegated the build questions in `tasks/02-traffic.md`. The pull request records the answers. The design is the source for the words.

- The brief says "Simulate". The button says "Send next event".
- The brief route is `/app/traffic`. The route is `/traffic`.
- The brief title is "Agent traffic". The heading and the nav say "Squad traffic".
- The chip says "All agents".
- `--color-rgba-13-13-13-2` is the approved token for `rgba(13,13,13,.2)`. The screen still paints the raw rgba. `--alpha-20` is a different value. The token script leaves the raw value.
- The progress line kept the old TLC numbers, 44 states and 115 steps. The Bus note records 56 states and 155 steps.
- The code queues every click. The model keeps one click.

### Task 03, Moe, 3 November 2026

Approved in `tasks/03-super-admin.md`, unless a line names another date.

- The brief says "Accounts", "All accounts", and "Agent images". The design says "Companies", "All companies", and "Squad images". The build uses the design. The design also keeps "accounts" in `aria-label` values, in the page titles "All accounts" and "Agent images", and in "34 accounts" and "reported by 5 accounts".
- The brief says 8 tiles. The design has 6 on screen 9. The build has those 6. The "Squads" tile shows 66, which is the sum of `account.agents`. Squads 17 is `totalSquads`. It is proved by the repository test and is not on a screen.
- The brief shows squad names in the table. The design shows the mission and no squad names. The build shows the mission.
- The brief says "All-time value". The tile says "All-time company value". The column says "All-time value".
- The plan and the brief say only a super admin sees "All companies". The design shows that link to everyone. The build follows the plan. This is who sees the link, not a change to the words on the screen.
- Decision 12 names the admin footer for the product name. The design's admin footer has no product name. The build follows the design: the footer shows the signed-in Clerk user's name and initials. Answer 7: in a special session the workspace footer shows the target account's `owner`. For Demo store this is the design's text.
- The design footer says "In this demo every company opens the same workspace." The sentence stays word for word. It is no longer true. A row opens that account. The other eight accounts show the phase 2 workspace with empty lists, tiles "—", and `Runs <agents> squads · <name>` from the stored account row. There is no fall back to Demo store.
- `agents`, `online`, and `tasks` stay stored on the account row. The design reads them and does not count agent rows. An approve in Demo store can change Overview to 332 while the account row stays at 331. The admin totals are still sums of those stored fields on each request. No table or column stores a total.
- "+9% vs last week" stays the design's fixed text. "Figures are demo data." stays on the screen. No weekly history exists to compute the percent.
- `createdWeek`, the week labels "Sep 7" through "Oct 26", `lastActive`, `updated`, `updatedFull`, and `age` stay the stored design values. "Updated this week" reads the `updated` text. Dates from today would change the screen.
- Answer 12, new sign-up metadata: a new account writes `createdWeek` 7 and `lastActive` "Just now", and it goes last in the order. The owner stays the email, because sign-up collects no name.
- The admin colours that fail contrast stay the design colours. Axe excludes only these named elements: `admin-coming-next` ("Usage and billing", "Platform health", "Admin users"), `admin-online-pill` ("53 squads online now"), and `admin-offline-count` (an online count of `0 / N`, colour `#8f8f8f`).
- The special-session cookie stays unsigned. Answer 4 says a verified super admin's cookie is the only one that counts, so it needs no signature and no new secret. The value is the account id, a dot, and the open time. The server rejects it more than one hour after that time. A forged time only extends that admin's own view.
- A removed `org:super_admin` role is gone at most 65 seconds after the token was minted: one 60-second session token plus Clerk's 5-second clock allowance. This development instance mints a session token whose `exp` minus `iat` is 60 seconds, measured on 3 November 2026. Clerk's verifier adds the 5-second allowance. The server does not call the Clerk Backend API on each request. Approved by the orchestrator under Moe's delegation, 3 November 2026.

### Preview check

Step 17 of task 03 is done by the orchestrator after merge. Builders do not deploy. After the merge, the orchestrator deploys main and checks that `/admin` and `/admin/images` send a visitor with no session to `/signin` on the live Worker.

## Phase 4 conflict

Reported to Moe. Not built in this pull request.

The plan says a Rollout object is added to the build, and that "Roll out" and "View changelog" leave the do-nothing list in phase 4. Phase 4 also says screens 1 to 10 do not change. This pull request adds no Rollout object, no Durable Object, no bus adapter, and no boat.dev adapter. Both controls still do nothing. The image-release model carries the later rules as abstract steps: an update never changes limits, rules, autonomy, or keys; a rollout stops after two failed health checks; when no rollout is running, every account runs the same stable version. The seed stays as written. Orders can be Stable at 29 of 31. That display is not the idle-rollout rule.
