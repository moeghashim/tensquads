# Final report

Screen 10 is in this pull request. Phases 1 and 2 are already on main. Each difference below has an approval. Nothing else ships as a difference from the design.

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

## Controls that do nothing

These stay as the design left them.

- Sign-in "Forgot password?" is an anchor with `href="#"`.
- Sign-in "Email me a sign-in link" is an anchor with `href="#"`.
- Homepage anchors with `href="#"`: About, Blog, Careers, Contact, Terms, Privacy, Security.
- Sign-up says "We'll ask you to connect these on the next step." That step does nothing and opens Overview. Decision 5.
- An empty chat message, or a second send while the first is working, does nothing.
- A blank action on the new-rule form adds no rule.
- "Roll out <nextVersion>" does nothing. On the seed the button reads "Roll out 2.1.1".
- "View changelog" does nothing.
- "Usage and billing", "Platform health", and "Admin users" are plain text under "Coming next". They are not controls.

Task 04 is not merged. Its controls are not in this list.

## Approved differences

Approved by Moe on 3 November 2026, in `tasks/03-super-admin.md`, unless a line names another date.

- The brief says "Accounts", "All accounts", and "Agent images". The design says "Companies", "All companies", and "Squad images". The build uses the design. The design also keeps "accounts" in `aria-label` values, in the page titles "All accounts" and "Agent images", and in "34 accounts" and "reported by 5 accounts".
- The brief says 8 tiles. The design has 6 on screen 9. The build has those 6. The "Squads" tile shows 66, which is the sum of `account.agents`. Squads 17 is `totalSquads`. It is proved by the repository test and is not on a screen.
- The brief shows squad names in the table. The design shows the mission and no squad names. The build shows the mission.
- The brief says "All-time value". The tile says "All-time company value". The column says "All-time value".
- The plan and the brief say only a super admin sees "All companies". The design shows that link to everyone. The build follows the plan. This is who sees the link, not a change to the words on the screen.
- Decision 12 names the admin footer for the product name. The design's admin footer has no product name. The build follows the design: the footer shows the signed-in Clerk user's name and initials.
- The design footer says "In this demo every company opens the same workspace." The sentence stays word for word. It is no longer true. A row opens that account. The other eight accounts show the phase 2 workspace with empty lists, tiles "—", and `Runs <agents> squads · <name>` from the stored account row. There is no fall back to Demo store.
- `agents`, `online`, and `tasks` stay stored on the account row. The design reads them and does not count agent rows. An approve in Demo store can change Overview to 332 while the account row stays at 331. The admin totals are still sums of those stored fields on each request. No table or column stores a total.
- "+9% vs last week" stays the design's fixed text. "Figures are demo data." stays on the screen. No weekly history exists to compute the percent.
- `createdWeek`, the week labels "Sep 7" through "Oct 26", `lastActive`, `updated`, `updatedFull`, and `age` stay the stored design values. "Updated this week" reads the `updated` text. Dates from today would change the screen.
- The admin colours that fail contrast stay the design colours. Axe excludes only these named elements: `admin-coming-next` ("Usage and billing", "Platform health", "Admin users"), `admin-online-pill` ("53 squads online now"), and `admin-offline-count` (an online count of `0 / N`, colour `#8f8f8f`).

## Phase 4 conflict

Reported to Moe. Not built in this pull request.

The plan says a Rollout object is added to the build, and that "Roll out" and "View changelog" leave the do-nothing list in phase 4. Phase 4 also says screens 1 to 10 do not change. This pull request adds no Rollout object, no Durable Object, no bus adapter, and no boat.dev adapter. Both controls still do nothing. The image-release model carries the later rules as abstract steps: an update never changes limits, rules, autonomy, or keys; a rollout stops after two failed health checks; when no rollout is running, every account runs the same stable version. The seed stays as written. Orders can be Stable at 29 of 31. That display is not the idle-rollout rule.
