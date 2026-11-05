# tensquads — Build Plan

Oct 31, 2026 · @Moe Ghashim

This plan tells you how to build the tensquads system from the design. The plan does not include the AI agents. The system runs on Cloudflare. Stripe Projects sets up the services. Agent machines run on boat.dev.

## Decisions

The build brief had 11 open questions. Moe answered all of them on 31 October 2026. The table shows each answer. The plan uses only these answers.

| # | Question | Answer |
| --- | --- | --- |
| 1 | Software stack | TanStack Start 1.0 (React, Vite) for the web app, on PI-Starter's tooling: strict TypeScript, Biome, `progress.md`, `no-mistakes`, skills. A cordis core in `packages/`. Drizzle for database access. Neon Postgres for the database. Cloudflare Workers for hosting, through the Cloudflare Vite plugin. Changed from Next.js on 31 October 2026 |
| 1b | Service setup | Stripe Projects sets up Cloudflare, Neon and Clerk. boat.dev is not in the Stripe Projects catalog, so we set it up by hand |
| 1c | Agent machines | Each agent runs on one boat.dev machine. Version 1 uses a test adapter with the same interface |
| 2 | Sign-in | Clerk, through Stripe Projects. A super admin is a Clerk organization role. There is no second sign-in |
| 3 | Many accounts | One Neon database. Each account row has an `account_id`. The data layer applies this rule. A super admin opens an account with a special session |
| 4 | Real or test agents | Test agents. The `send()` and `nextEvent()` functions from the design run behind the real interfaces. Version 1 has no AI model and no real machines |
| 5 | External services | All are placeholders. The design has no screen for "connect on the next step". That step does nothing and opens Overview |
| 6 | Billing | The system records plans and the trial. Version 1 does not charge money |
| 7 | Second squad | Not in the screens. The data model permits many squads per account |
| 8 | Empty, loading and error states | The agent lists each one when it finds it. Moe decides for each screen. The agent does not design them |
| 9 | Mobile | The screens stack at 390 px, as the design does. This is acceptable |
| 10 | Placeholders | `[CUSTOMER QUOTE]` and the other placeholders stay as written |
| 11 | Controls that do nothing | They stay as controls that do nothing. The final report lists them |
| 12 | Name | The repository is `moeghashim/tensquads`. The product name is tensquads in all places: package scope `@tensquads`, app title, admin footer. The code does not use "10Squads" or "Business Agents". Design updated on 31 October 2026: canvas title, homepage, sign-up header, page titles and the preview address now say tensquads |
| 13 | Sign-in screen | Clerk elements, styled with the design tokens. No Clerk hosted page. Design updated on 31 October 2026: new screen \`SignIn.dc.html\` (route \`/signin\`); "Sign in" on the homepage and the sign-up page opens it |
| 14 | Cloudflare account | The Cloudflare account that Stripe Projects links when we run \`stripe projects add cloudflare/worker\` |
| 15 | boat.dev account | Moe's boat.dev account, with a new environment \`tensquads-agents\` |
| 16 | How agents send messages to each other | Cloudflare Queues carry the messages. One Durable Object per account orders them and applies the state writes. Neon holds the record. The Durable Object is the only writer to the bus tables. Version 1 uses an in-memory bus behind the same EventBus interface |
| 17 | Where the master runs | The master core (events, state, inbox, routing, model calls) runs on Cloudflare as the account's Durable Object and a Worker. It never depends on a boat.dev machine. A boat.dev machine is used only for work that needs a full computer. Agent machines run always on, size small, as a systemd service with a heartbeat to the Durable Object |
| 18 | How updates reach running agents | An agent image is ours; the account state is the customer's and never lives on the machine. A skill update is a bus message and a cordis plug-in swap, with no restart. An image update starts a new machine from the new template, checks it, then switches. Rollout goes in rings: Draft, Beta, Stable. No customer may pin a version. Everyone moves to Stable |
| 19 | Small typed decisions (TypeSafe Jev) | Not used in version 1. A Decider interface goes into the core in phase 0 with no adapter. Later, the first adapter uses the main model with structured output. A Jev adapter may replace it for routing, the autonomy gate and guardrails, when the service is open and a test shows it is faster and as correct |
| 20 | The agent loop and verified outcomes | Each agent runs one loop: take a task, plan, run skills through their gates, collect evidence, send a Result. Every task carries a check that code runs. The master core runs the check. A task is done only when the check passes. The agent never grades its own work |
| 21 | Proof of concept: order | Phase 5, after the machines and bus adapters. Three squads: master, Market researcher, Website builder. Confirmed by Moe on 31 October 2026 |
| 22 | Proof of concept: the website | One landing page on \<slug>.10squads.com, published through Cloudflare Pages |
| 23 | Proof of concept: the research | Web search to find competitors, the Scrapling service on boat.dev to read their pages, the model to analyse offer, price, positioning and gaps |
| 24 | Proof of concept: the model | OpenAI, with an API key from Moe, kept in the boat.dev key proxy. Design updated on 31 October 2026: Market researcher and Website builder added to the homepage cards and sign-up step 3 |
| 25 | Overview tiles for an account with no store | The Revenue and Orders tiles show "—". The layout does not move |
| 26 | Where the site preview appears | A link in the chat only. No new screen or panel |
| 27 | Tints for the two new agents | Market researcher #fde2f3, Website builder #e5e9f0. Added to the token list |
| 28 | Proof of concept: the business type | Restaurants or grocers. For a restaurant, the Website builder makes a menu page: top design and UX, with a cultural touch when the restaurant is cultural. For a grocer, it makes a one-page list of the items |
| 31 | A second database | Decided by Moe on 5 November 2026. Version 1 uses one database, Neon. Neon answers every version 1 question. ClickHouse is not in version 1. It comes after phase 5, if event volume needs it. Decisions 29 and 30 stay dropped |
| 32 | Borrowed from dsh-superagent | Four things from github.com/deepseek-ai/dsh-superagent-prototype, decided on 2 November 2026. (1) Inbound events use the names Source, Trigger and Eval; Eval is a code gate plus a Decider judgement. (2) Each Approval records a Mandate: the rule it matched, the limit at that time, the policy version and who said yes. (3) The Agent loop state model gains Waiting, Blocked and Dropped. (4) The plan keeps a Rejected concepts table |
| 33 | Squadmates: names and characters | Decided by Moe on 3 November 2026. Each agent image has one fixed character name, taken from a famous place: master Petra, Orders Pisa, Support Kyoto, Marketing Rio, Finance Zurich, Inventory Giza, Market researcher Machu, Website builder Angkor, Analytics Delphi, People Sydney. A customer cannot rename the master or an agent. Each agent shows a character: one round body in the agent's colour, one role accessory, and eyes that show the Agent loop state. The reference drawing is `/review/characters`. This departs from the canvas: where a screen shows the master's name or an agent's mark, the build shows the character name and the character. The design's agent name ("Orders") stays as the role tag. No screen shows the word "master": the interface says "Petra", for example "Chat with Petra" (Moe, 3 November 2026). Task 06 builds it |
| 34 | Homepage redesign | Decided by Moe on 3 November 2026. Screen 1 gets a new design, made with the impeccable skill, with an inspiring hero that shows the squadmates. Moe approves the new design before it is built. The approved design lives in `docs/designs/home/` and replaces `Home.dc.html` as the reference for screen 1 only. The copy, the New and Existing toggle, the prompt box, the pricing and the path to sign-up stay, unless Moe approves a change. Task 07 builds it |
| 35 | Proof of concept: repositories | Decided by Moe on 4 November 2026. He accepted the recommendations in `docs/handoffs/poc-squad-repos.md`. The Market researcher is the private repository `moeghashim/tensquads-market-researcher`. The Website builder is the private repository `moeghashim/tensquads-website-builder`. The shared bus contract and the agent loop are the private repository `moeghashim/tensquads-agent-kit`. A consumer pins one commit of the kit with an npm git dependency. The master stays in `moeghashim/tensquads`. Four task files replace the single phase 5 task. `tasks/05-proof-of-concept.md` keeps the final "Done when" list. ADR 0002 records the split |

No question is open. Moe answered items 13 to 15 on 31 October 2026. The web framework changed from Next.js to TanStack Start the same day. TanStack Start reached version 1.0 on 13 October 2026. Its server build is a plain fetch handler, so it runs on a Worker with no adapter. Cloudflare is an official hosting partner. Clerk has an official SDK for it.&#32;

## Architecture

The system has four layers. The web app is the top layer. The core is below it. The core has six domain areas. Each domain area is a plug-in. The domain areas reach the outside only through interfaces. Adapters connect the interfaces to real services. Version 1 uses test adapters. This makes the screens correct before any real service exists.

&#91;embedded content: system layers · web, kernel, ports, adapters\]

The blue box is what version 1 runs. We build the boat.dev adapter later. It uses the same `MachineProvider` interface. No screen changes when we switch adapters.

**Domain areas.** Each domain area is one cordis plug-in. It has its own data objects, its own data access and its own events. When you remove a plug-in, it leaves no trace in the core.

| Domain area | Data objects | What it owns from the design | Screens |
| --- | --- | --- | --- |
| Platform | Account, Plan, Subscription | accounts table, totals, plan mix, accounts-created chart, sign-up step 2 | 2, 9 |
| Squads and Agents | Squad, Agent, Skill, Machine | agent list, agent dashboard, on/off switch, autonomy, skill gates, machine details | 3, 5, 6 |
| Bus and Shared State | BusEvent, StateStore | traffic diagram, event list, inspector, state table, Live and Simulate (`nextEvent()`) | 4, 6, 7 |
| Policy | Rule, Limit, Approval | rules list, new-rule form, three sliders, approval inbox, chat dock badge | 3, 8 |
| Catalog | AgentImage, Bug, FeatureRequest | images table, detail panel, attention badge | 10 |
| Conversation | Thread, Message | chat page, chat dock, suggestion chips, test `send()` | 4 |

Some rules cross domain areas. The core applies these rules, not the screens:

- When you approve an approval, the agent's `tasks` count increases by one. The agent's `last` field changes to the approval title plus " (approved)".
- When a bus event has `writes`, the core writes them to the shared state.
- A limit slider writes to the `policy.*` keys. The traffic state table reads the same keys.
- When you switch an agent off, the core sets CPU to 0% and uptime to "Paused". It does this through the `MachineProvider` interface.

**Where cordis is used.** Cordis is the core only. The web app is TanStack Start. The app calls the core through server functions. The app, the Durable Object and the Queue consumer live in one Worker with one wrangler.jsonc. The cordis README says its API is not stable. For this reason, we pin cordis to one commit. All calls to cordis go through one small `Kernel` module. If the cordis API changes, we change only this module. The plug-ins do not change.

**The boundary layer.** The domain reaches outside through three interfaces. Each interface keeps a foreign vocabulary out of the domain:

- `MachineProvider`. The boat.dev words (sandbox, snapshot, credentials proxy) stay outside.
- `IntegrationGateway`. The Shopify, Gmail and Stripe data shapes stay outside.
- `Repositories`. Database rows become domain objects here. No database type crosses this line.

The design's mock data is a fourth foreign model. One seed module converts it to domain objects, one time, with no changes.

A fifth interface, `Decider`, takes a question and a list of possible answers. It returns one answer and a confidence. Version 1 has no adapter for it. Later, the master uses it to pick an agent, the Policy area uses it for the autonomy gate, and the guardrails use it to pass or block a message (decision 19).

**Many accounts in one database.** Each account table has an `account_id` column. Each data access function receives an `AccountScope`. The function rejects a query that has no scope. When a super admin opens an account, the system makes a special session. The session carries the target `account_id`. The workspace screens do not see a difference. The design shows this: only a super admin sees the "All accounts" link.

**How agents send messages (decision 16).** The `EventBus` interface has two adapters. Version 1 uses an in-memory bus. It replays the design's events with `nextEvent()`. Later, the Cloudflare bus replaces it:

- Cloudflare Queues carry tasks to agents and results back. Retries and a dead-letter queue are built in. Agent machines on boat.dev send to a Worker endpoint and pull from a queue over HTTP.
- One Durable Object per account receives each event. It gives the event a sequence number, applies the `writes` to the shared state, and pushes the event to the open browser. This is the "Live" view.
- Neon keeps the record. All screens read from Neon. The Durable Object is the only writer to the bus tables.

Three rules for the bus: each event has an `id`, and the Durable Object drops an id it has seen; the traffic screen sorts by sequence number, not by time; a message that fails all retries becomes an Escalation event to the master.

**Where the master runs (decision 17).** boat.dev can run a machine 24/7 on a paid plan, but it publishes no uptime promise. So the master has two parts:

| Part | What it does | Where it runs |
| --- | --- | --- |
| Master core | Receives every event. Orders them. Applies state writes. Holds the approval inbox. Picks the agent for each task. Calls the model to plan and to write chat replies | The account's Durable Object and a Worker on Cloudflare. Cloudflare keeps it alive and moves it when a host fails |
| Master hands | Work that needs a full computer: a browser, a long script, a file on disk | A boat.dev machine, started only when needed |

If boat.dev is down, the master still answers the chat, routes tasks and records events. Tasks wait in Cloudflare Queues. When the machines come back, the queue drains. The same split applies to each agent: its mission, limits, memory and keys live in Neon and in the key proxy, not on the machine.

**Where the data lives.**

| Data | Store | Rule |
| --- | --- | --- |
| Business results (revenue, orders, hours saved, the 14-day bars) | Neon, one row per account per day | A fact is stored once, with its date |
| Agent results (tasks, success, saved, last, per-agent KPIs) | Neon, on the agent row and a metrics table | Each Result and Approval event updates the count. The Durable Object writes it |
| Platform totals (Accounts 9, Agents 66, MRR, LTV, plan mix) | Not stored | Computed from the accounts and subscriptions tables on each request |
| Shared state (`order.*`, `policy.*`) | The Durable Object, with write-through to Neon | Only the Durable Object writes it |
| Mission, limits, rules, memory | Neon | Never on a machine |
| Keys | The boat.dev key proxy and Worker secrets | Never on a machine, never in git |

**How updates reach running agents (decision 18).** The Agent images screen already has `version`, `nextVersion`, `onLatest` of `deployed`, "Roll out" and "View changelog". These become real.

An agent has two parts. The image is ours: the code, the skills, the prompts, the cordis plug-ins. It lives in a boat.dev template. The account state is the customer's: the mission, the limits, the rules, the keys, the memory. It lives in Neon and in the key proxy. It never lives on the machine. So we can replace a machine and lose nothing. The master is an image too. It updates the same way.

| Kind of update | Example | How it ships | Restart |
| --- | --- | --- | --- |
| Skill update | A better skill for Marketing, or a new prompt | The Durable Object sends an "update skill" message on the bus. The agent's cordis core unloads the old plug-in and loads the new one. The old plug-in's effects revert | No |
| Image update | A new runtime, a new model, a change to how the master plans | The Catalog marks a new version. Roll out starts a new machine from the new template, mounts the account state, runs a health check, then switches. The old machine stays for 24 hours for a rollback | Yes, about one minute. The dashboard shows "Updating" |

Rollout goes in rings. A version goes Draft, then Beta, then Stable. Beta goes to our own accounts first, then to accounts that opted in, then to all. The "Roll out" button starts the next ring. "On latest: 4 of 7 deployed" shows progress. The Durable Object moves one account at a time, so a bad version stops early. No customer may pin a version. Everyone moves to Stable.

Rules an update may never break. They become invariants in the Image release state model:

- An update never changes an account's limits, rules or autonomy.
- An update never touches a customer's keys.
- A rollout stops itself when the health check fails twice.
- Every account on Stable runs the same version.

What this adds to the build: a Rollout object in the Catalog domain area; two methods on `MachineProvider`, make a template and start a machine from a template; "Roll out" and "View changelog" leave the "do nothing" list in phase 4. Version 1 ships none of it. The interfaces exist and the test adapter answers.

**The agent loop and verified outcomes (decision 20).** Each agent runs one loop, forever, on its machine:

1. Take the next task from the bus.
2. Plan the steps with the model.
3. Run one skill at a time. Each skill has a gate: Auto, Ask first, or Under limit.
4. Collect the evidence: what the skill returned, and what changed in the store, the inbox or the ad account.
5. Send a Result event with the evidence and the trace. Or send a Request, an Escalation or an Approval when the agent cannot finish alone.
6. Go to step 1.

The agent keeps nothing between loops. The bus has it all.

Every task carries a check that code can run, for example "order A-1007 has a tracking number in Shopify" or "the refund is under the limit". The master core runs the check when the Result arrives. The model does not grade the model. This is the same rule as `make verify` for the build.

| Check result | What the master does | What the design shows |
| --- | --- | --- |
| Pass | Marks the task done. Adds one to the agent's `tasks` and `success`. Updates `last` | The agent card and the traffic list |
| Fail | Sends the task back once with the evidence. On a second fail, makes an Escalation to the owner | An Escalation event, the approval inbox |
| No check possible | The task needs a yes from the owner before it starts. It goes to the inbox as an Approval | The Approve and Decline buttons |

The `success` number on the agent dashboard is the ratio of passed checks. The system computes it; it does not store it.

**Borrowed from dsh-superagent (decision 32).** DeepSeek's dsh-superagent prototype is a coding agent for one repository, built on cordis, with a main session and one executor per work item. Four of its ideas go into tensquads:

- Source, Trigger, Eval. An inbound event (a monitor alert, a webhook from a store, a message) is a Trigger from a Source. Eval decides whether it starts work: first a code gate (who may ask, which rule allows it), then a Decider judgement. The user's chat message is a Source too, with a gate that always passes for the account owner.
- Mandate. Every Approval records: the rule it matched, the limit at that time, the policy version, and who said yes. A Mandate is immutable. A later change to a rule never changes a Mandate. This makes "an update never changes limits" (decision 18) a rule TLC can prove against history.
- Report states. The Agent loop gains Waiting (nothing to do now, keep the machine), Blocked (a person must act; the machine slot is free) and Dropped (nothing to do at all; ends with no message unless a rule asks for one).
- Rejected concepts. The table below. An agent that proposes one of these must cite the row and say why the reason no longer holds.

Rejected concepts:

| Rejected | Reason |
| --- | --- |
| A customer may pin an agent version | Decision 18: everyone moves to Stable |
| The master runs on a boat.dev machine | Decision 17: boat.dev publishes no uptime promise. The master core runs on Cloudflare |
| Agents write to Neon | Decision 16: the Durable Object is the only writer |
| The agent grades its own result | Decision 20: the master runs a check that code runs |
| A second database in version 1 (ClickHouse, D1) | Decision 31: Neon answers every version 1 question |
| Next.js on Workers through an adapter | Decision 1: TanStack Start runs on a Worker with no adapter |
| A hosted Clerk sign-in page | Decision 13: Clerk elements with the design tokens |
| A screen, state or copy the design does not show | The brief: ask, never design |
| A "person" entity in the domain | A person is who sent a Trigger; an allowed list is part of the Policy. Clerk holds the account, not the domain |
| The builder invents a dish, an item or a price | Decision 28: the user's list is the only source |

## Repository and tools

Copy PI-Starter to a new repository `moeghashim/tensquads`. Keep its checks and skills. Replace its Next.js app with a TanStack Start app. Add three packages and the pstack skills. The git identity is Moe Ghashim, mohanadgh@gmail.com.

```
tensquads/
  AGENTS.md                 the rules for AI agents (CLAUDE.md points to this file)
  progress.md               a log of lessons; you can only add lines
  Makefile                  make verify = lint + types + unit tests + e2e tests + statechart check
  apps/web/                 the TanStack Start app; one Worker holds the app, the Durable Object and the Queue consumer
    src/routes/             /, /signup, /signin
    src/routes/app/         overview, chat, agents, agents.$id, traffic, rules
    src/routes/admin/       accounts, images
    design/                 tokens.css made from tokens.json; SVG icons copied from the design
  packages/
    kernel/                 the cordis core, the Kernel module, the plug-in loader
    domain/                 six domain areas, one folder each
    adapters/               test-machine, boat-machine (trial), neon-drizzle, placeholder-services
    seed/                   the design's mock data as domain objects; the tests check the DoD numbers here
    statecharts/            TLA+ models, their settings, their view files, the charts they make
  e2e/                      Playwright tests: one file per screen, one test per behaviour line
  .agents/skills/           the skills, in the agentskills.io format (also at .claude/skills)
  .projects/                Stripe Projects state (state.json is in git; the vault is not)
  docs/adrs/                one short record for each architecture decision above
```

**From PI-Starter, with no change:** strict TypeScript, Biome, the pre-commit hook, the `progress.md` add-only check, the `no-mistakes` push check (`git push no-mistakes`), the Fallow audit, the "Required checks" job in GitHub Actions, the Cloudflare build job, DCO sign-off, Dependabot.

**New:** TanStack Start 1.0 (pinned), the Cloudflare Vite plugin, Drizzle and the Neon driver, the Clerk SDK for TanStack Start, cordis (one pinned commit), Playwright with screenshot comparison at 1440 px, axe-core for keyboard and label checks, mise to install TLC and Java for the statechart skill.

**Skills in `.agents/skills/`** (one `SKILL.md` per folder):

| Skill | Source | Use |
| --- | --- | --- |
| statechart | pstack | model and draw each state machine below; run again on each change |
| create-formal-verification-skill, maintain-formal-verification-skill | pstack | make a skill for this repository after the first model exists |
| tdd, prove-it-works, test-behavior-not-implementation | pstack | rules for the builder agent |
| model-the-domain, boundary-discipline, separate-before-serializing-shared-state | pstack | rules for the domain areas and the boundary layer |
| sequence-verifiable-units, make-operations-idempotent | pstack | how to cut the work into small tasks |
| architect, interrogate, unslop | pstack | prompts for the planner and the reviewer |
| stripe-projects | stripe/ai | set up services from the terminal |
| react, ui, memory-leak-debugging, ADR workflow | PI-Starter | screen work |

**The verify check.** `make verify` runs these steps in order:

1. `npm run check`: Biome and the TypeScript compiler.
2. `npm test`: unit tests. These include the seed checks: Accounts 9, Agents 66, Squads 17, Monthly recurring $1,294, All-time value $14,568, Tasks done 331, Images 7, Bugs 8, Features 15.
3. `npm run e2e`: Playwright on all ten screens, screenshot comparison with the design, axe checks.
4. `npm run statechart:check`: TLC checks each model again and makes the charts again. The charts must match the ones in git.

Exit code 0 is the only proof that work is done. CI runs the same command.

**Keeping the model check fast.** TLC needs Java. Three measures keep it off the pull-request path when it is not needed:

1. CI runs `statechart:check` only when a file under `packages/statecharts/` changes, or a code file that a model names in its `# model:` comment. Screen work never starts Java.
2. mise installs TLC and Java once. GitHub Actions caches the install by its lock hash. A repeat install takes seconds.
3. Each model sets small constants, for example 3 agents and 5 events. A model that needs more than 100,000 states gets a `CONSTRAINT`. The eight models check in parallel, one job each. The target is under one minute per model.

Fallback, if a check still passes one minute: the model check moves to a nightly schedule and to pull requests with the label `model`. `make verify` on a laptop still runs it on demand. A model that breaks should block the merge that broke it, so the fallback is not the default.

## Service setup

Stripe Projects sets up all services except boat.dev. Run the commands from the repository root. The keys go into `.env` through the Stripe vault. They do not go into chat or into git.

```
npm install -g @stripe/cli@latest && stripe plugin install projects
npx skills add https://github.com/stripe/ai --skill stripe-projects -y -g
stripe projects init tensquads
stripe projects add cloudflare/worker      # hosting and domain; queues and storage later
stripe projects add neon/postgres          # database
stripe projects add clerk/auth             # sign-in for owners and super admins
stripe projects env --pull                 # writes .env; git ignores .projects/vault
```

Add these later, in the same way, when a phase needs them: `posthog/analytics`, `resend/email`, `inngest/app`.

**Set up boat.dev by hand.** boat.dev is not in the Stripe Projects catalog. Make one boat environment with the name `tensquads-agents`. Mark it safe for third parties. Then each agent machine starts with `noEnv: true`. The machine gets only the values that `MachineProvider` passes with `--env`: `ACCOUNT_ID`, `AGENT_ID`, `IMAGE_TAG`. The boat API key is a Cloudflare Worker secret. It never goes into a machine. Use the boat "stop and resume" pattern for the agent on/off switch. A stopped machine shows CPU 0% and uptime "Paused", as the design shows.

| Field in the design | Source in boat.dev | Version 1 (test adapter) |
| --- | --- | --- |
| host | machine id and host name | value from Main.dc.html |
| region | machine region | value from Main.dc.html |
| size | CPU and memory tier | value from Main.dc.html |
| cpu, uptime | machine metrics | value from Main.dc.html; 0% and "Paused" when off |
| egress | permitted hosts in the boat key proxy | list from Main.dc.html |
| secrets | key names in the boat key proxy; values never enter the machine | names from Main.dc.html |
| image tag `registry.agents.co/<id>:<version>` | boat template id | value from Main.dc.html |

**Secrets.** The Clerk, Neon and boat keys are Worker secrets. Set them with `wrangler secret put` from the `.env` file. The agents' own third-party keys (Shopify, Gmail) go into the boat key proxy later, one set per machine. No secret goes into git, into CI output or into an agent prompt.

**Machine specification (decision 17).** From [docs.boat.dev](https://docs.boat.dev/pricing.md): small is 2 vCPU, 4 GB, 51 GB disk, $13 a month always on. default is 4 vCPU, 8 GB, $26. boat saves the disk every minute. After a stop, the disk comes back; memory, running programs and the IP address do not. boat publishes no uptime promise.

| Setting | Value | Why |
| --- | --- | --- |
| Size | `small` | The agent waits for messages and calls a model. Move one agent to `default` only when a task shows it needs the memory |
| Create | `noEnv: true`, `ttlSeconds: null`, env `ACCOUNT_ID`, `AGENT_ID`, `IMAGE_TAG` | No account secrets. No auto-stop. The backend can map the machine to its agent |
| Runtime | A systemd service | It starts again on its own after any stop or resume |
| Heartbeat | One message to the account's Durable Object every minute | After three missed heartbeats, the Durable Object resumes the machine. If resume fails, it creates a new machine from the template. The dashboard shows "Restarting" |
| Memory | Nothing the agent cannot lose | Every result goes to the bus at once |
| Cost | Five agents on `small`, always on: $65 per account per month. Stop and resume for idle agents: a few dollars | Always on is a plan feature, decided later |

Two questions for boat.dev before we depend on them: what happens to a running machine when a host fails, and whether a second region exists.

## State models

The system has eight state machines. We write a TLA+ model for each one before we write its code. The pstack `/statechart` skill checks each model with TLC. It also draws a chart. The models and charts live in `packages/statecharts/`. CI checks them again on each change.

| Machine | States | Rules that TLC must prove | Screens |
| --- | --- | --- | --- |
| Agent on/off | Off, Starting, On, Stopping, Paused | Off means CPU 0% and uptime "Paused". A skill cannot run when its agent is Off. A change of autonomy does not change on/off | 5, 6 |
| Approval | Pending, Approved, Declined | Approve adds one task to one agent and sets its `last` field. Decline changes no agent. The inbox count equals the dock badge count. An empty inbox shows "Nothing waiting" | 3, dock |
| Bus event and shared state | Queued, Delivered, Acknowledged, Dead letter; Live, Paused, Selected event | `nextEvent()` adds one event and applies all its writes in one step. Live and Simulate do the same step. A filter never hides the selected event. An id seen before changes nothing. A dead letter always makes one Escalation event | 7 |
| Rules and limits | Rule on/off, three sliders | A slider and the traffic state table always show the same `policy.*` value. A rule switch changes only that rule | 7, 8 |
| Sign-up | Type, Details, Squad, Created | New pre-selects Marketing, Orders, Support. Existing pre-selects Orders, Support, Finance, Inventory. Zero agents blocks Create. Back goes one step. Create makes one account, one squad, N agents, one master and default limits | 2 |
| Chat and dock | Idle, Working, Replied | `send()` shows the user bubble, then the working line, then the master reply, then one bus event. The dock and the page share one thread and one draft. The dock is hidden on the chat page and on admin pages | 4, dock |
| Image release | Draft, Beta, Stable, Needs attention | The attention badge equals the count of "Needs attention" images. "On latest" shows onLatest of deployed, or "Not deployed yet". "Roll out" does nothing in version 1. Later: an update never changes limits, rules, autonomy or keys. A rollout stops after two failed health checks. Every Stable account runs the same version | 10 |
| Agent loop | Waiting, Planning, Running skill, Checking, Done, Sent back, Blocked, Escalated, Dropped | A task reaches Done only through Checking with a pass. A second fail always reaches Escalated. Blocked means the agent waits for a person and holds no machine slot. Dropped means there was nothing to do, and it ends with no message unless a rule asks for one. A skill with gate Ask first never runs before an Approval. An Approval always carries a Mandate. The agent holds no task state outside the bus | 6, 7 |

Each chart uses the words from the design, for example "Paused" and "Nothing waiting". A reader sees the product, not the code. When TLC finds a path that breaks a rule, the builder agent first writes a Playwright test for that path. If the test cannot show the bug, the model is wrong. Correct the model first.

Write the Approval model first, in phase 0. Then run `/create-formal-verification-skill`. This makes a skill with the name `tensquads-verify`. The skill knows where the models, settings and charts are. All later models follow the same shape.

## How the AI agents work

Three agents do the work. A planner writes the task. A builder builds it on a branch. A reviewer tries to find faults in it against the design. No work merges until `make verify` returns 0 in CI.

| Agent | Reads | Makes | Must not do |
| --- | --- | --- | --- |
| Planner | this plan, the build brief, the design file for the screen, `progress.md` | one task file per screen. The file has: the behaviour lines as tests, the design file path, the state model it touches, the done checklist | invent screens, text, states or data; decide an open question |
| Builder | the task file, the full design `.dc.html` file, `tokens.json`, the skills | a branch, the screen, its Playwright test, seed changes, chart changes, a pull request with `git push no-mistakes` | say "done" without `make verify` 0; design an empty, loading or error state (it asks a question instead) |
| Reviewer | the pull request, the design file, the done checklist. Not the builder's notes | a list of faults. It compares screenshots at 1440 px. It runs each behaviour line. It checks the numbers, the keyboard, the 390 px view and all text | approve because it "looks right"; review the architecture (that is fixed above) |

**What the reviewer checks.** The build brief says: review all requirements that are not architecture. These are layout, spacing, colour, text, data shapes, behaviour, computed numbers, keyboard use and the 390 px view. The reviewer does not see the builder's notes. This keeps the review independent. The reviewer gives a list of faults. For each fault, it gives the design line that proves it. If it finds no fault for a checklist item, it says so.

**Done checklist, per screen** (from the build brief, with no change):

- [ ] A screenshot of the built screen at 1440 px next to the design at 1440 px. No visible difference. Both images are in the pull request.
- [ ] Each behaviour line for the screen is one e2e test. All tests pass in CI.
- [ ] The computed numbers match the design values with the seed data loaded.
- [ ] Tab reaches each control. Each icon-only button has an `aria-label`. Each input has a label. The focus ring is 2 px `#0169cc` with a 2 px offset.
- [ ] At 390 px wide, there is no horizontal scroll, except inside the table boxes.
- [ ] `make verify` returns 0.

**Ask, do not guess.** The builder sends a question to Moe when it finds: a state the design does not show, a conflict between two design files, or a reason to reopen one of the 11 decisions. Each question is a numbered item with a recommended answer. The builder stops that screen until Moe answers. It moves to the next task that is not blocked.

**Progress and proof.** Each merged pull request adds one line to `progress.md`. The PI-Starter commit hook permits only additions. When screen 10 merges, the builder writes the final report. The report lists: each decision and its answer, each control that does nothing, and each approved difference from the design. Nothing else can ship as a difference.

## Phases

The phase list includes the original phases 0 to 5 and the additions from decisions 33 and 34. Build the screens in the order of the build brief. Phase 2 is the largest. In phases 0 to 5, a phase starts only when the phase before it passes its check. Phase 6 follows [task 06](../tasks/06-squadmates.md). Phase 7 follows [task 07](../tasks/07-home-redesign.md). Those task files set their prerequisites.

&#91;embedded content: build phases · tasks and build status\]

**Phase 0: Foundation.**

1. Copy PI-Starter to `moeghashim/tensquads`. Replace `apps/web` with a TanStack Start app made with `npm create cloudflare`, framework `tanstack-start`.
2. Run `stripe projects init`. Add Cloudflare, Neon and Clerk.
3. Pin cordis to one commit. Build the `Kernel` module with six empty plug-ins and the five interfaces: MachineProvider, EventBus, IntegrationGateway, Repositories, Decider. Decider has no adapter in version 1 (decision 19).
4. Write the Drizzle schema for each data object. Add `account_id` to each account table.
5. Write the seed module. It reads the mock data in `Main.dc.html`. Its tests check the nine done numbers.
6. Make `tokens.css` from `tokens.json`. Note the places where the inline styles in the design win.
7. Copy the 16 px SVG icons from the design.
8. Set up Playwright, axe and screenshot comparison. Install TLC with mise.
9. Write the Approval state model. Make the `tensquads-verify` skill.
10. Make `make verify` pass on the empty app.

Phase 0 is complete when CI is green, the Cloudflare preview deploys, and the seed tests pass.

**Phase 1: Public screens.** Build screen 1 (Homepage) from `Home.dc.html`. Build screen 2 (Sign-up) from `Onboarding.dc.html`. Build the sign-in screen from SignIn.dc.html with Clerk elements. A correct sign-in opens Overview. "Create my workspace" makes the account, the squad, the agents, the master and the default limits. Check the Sign-up state model. Phase 1 is complete when both screens pass the done checklist, and a new account exists in Neon after the e2e run.

**Phase 2: Workspace.** Build the shared frame first: the sidebar, the agent rows with status dots, the user footer, and the chat dock with its badge. Then build screens 3 to 8 in order: Overview, Chat, Agents, Agent dashboard, Traffic, Rules. Each screen adds its state model, its e2e test and its seed check. The test `send()` and `nextEvent()` functions run inside the Conversation and Bus plug-ins. The test `MachineProvider` gives the CPU and uptime values. Phase 2 is complete when all six screens pass the done checklist. The system computes Tasks done = 331. It does not store it.

**Phase 3: Super admin.** Build screens 9 and 10 with the "Platform admin" sidebar and no chat dock. Add the super-admin role in Clerk. Add the special session, so that a click on an account row opens that account's workspace. Compute the totals from the full list. Check the Image release state model. Phase 3 is complete when both screens pass the done checklist. The system computes: Accounts 9, Agents 66, Squads 17, Monthly recurring $1,294, All-time value $14,568, Images 7, Bugs 8, Features 15. Write the final report here.

**Phase 4: Machine trial.** Build the boat.dev adapter for `MachineProvider`. The adapter must: start a machine with `noEnv: true` and tags, stop it, start it again, read its metrics into the agent dashboard fields, register one secret name in the key proxy, and remove the machine. Build the Cloudflare bus adapter for EventBus in the same phase: one queue, one Durable Object class, write-through to Neon. Put both adapters behind a feature flag. The test adapters stay the default. There is no AI model, no agent runtime and no external service. Phase 4 is complete when the adapter tests pass against a real boat machine in a manual CI job, and screens 1 to 10 have no change. Phase 5 is the proof of concept, in its own section below.

**Not in any phase:** real agents other than the three proof-of-concept squads, real external services other than search, Scrapling and Cloudflare Pages, billing, a second squad, a mobile design, and empty, loading or error states other than the two in the design.

## Proof of concept

The first real agents are three squads: the master, a Market researcher and a Website builder. The user types a business name and picks restaurant or grocer. The researcher finds the competitors and reports how they do. The master writes a brief and asks the user. The builder makes one page from the report and the brief: a menu page for a restaurant, an item list for a grocer. The master asks the user again, then publishes. Decision 35 splits the work across four task files: `tasks/05-agent-kit.md`, `tasks/05-market-researcher.md`, `tasks/05-website-builder.md`, and `tasks/05-proof-of-concept.md`.

&#91;embedded content: proof of concept · 13 steps, 2 checks, 2 approvals\]

**Decisions for the proof of concept (21 to 24).**

| # | Question | Answer |
| --- | --- | --- |
| 21 | Order | Phase 5, after phase 4. The chat, the inbox, the traffic screen and the real adapters must exist first. Confirmed |
| 22 | The website | One landing page on `<slug>.10squads.com`, published through Cloudflare Pages |
| 23 | The research | Web search to find the competitors. The Scrapling service on boat.dev to read their pages. The model to analyse them: offer, price, positioning, strengths and gaps |
| 24 | The model | OpenAI, with an API key from Moe. The key goes into the boat.dev key proxy. It never enters a machine. A Decider adapter can use the same key for the typed decisions later |

**What each squad does.**

| Squad | Model | Skills, with gate | The check that code runs on the Result |
| --- | --- | --- | --- |
| Market researcher | A cheaper GPT-6 tier | `web.search` Auto · `maps.competitors` Auto · `scrapling.read_page` Auto · `market.analyse` Auto · `report.write` Auto · `competition.watch` Ask first | At least three competitors. Each has a URL that returns 200. Each has a price or an offer taken from its page. The report names a gap |
| Master | A cheaper GPT-6 tier | `brief.write` Auto · `task.route` Auto · `approval.ask` Auto · `check.run` Auto | The brief is under 150 words and names the gap from the report |
| Website builder | GPT-6 Astra | `site.build` Auto · `site.critique` (impeccable) Auto · `site.preview` Auto · `site.publish` Ask first | The preview URL returns 200. The page has the business name. Every menu item or grocery item has a name and a price. No link on the page is broken. The page passes the keyboard and contrast checks |

Moe decided on 4 November 2026 that the phase 5 task files win where this table disagreed with them on the skill list or on GPT-6 Astra. The table now matches those files.

**The business type (decision 28).** The proof of concept is for restaurants or grocers. The user picks one in step 1. The page the builder makes depends on it:

| Business type | What the builder makes | What the researcher looks for | The check that code runs |
| --- | --- | --- | --- |
| Restaurant | A menu page. Top design and UX. A cultural touch when the restaurant is cultural: the type, the colours and the layout follow the cuisine, with no cliché | Competitor menus, price ranges, cuisine, how they present dishes | Every menu item has a name and a price. Sections are in the order the user gave. The page passes the keyboard and contrast checks. The cuisine named in step 1 appears on the page |
| Grocer | A one-page list of the items, with prices and sections | Competitor item lists, price ranges, delivery and opening hours | Every item has a name and a price. The list has the sections the user gave. The page works at 390 px |

The menu or the item list comes from the user. In step 1 the user pastes the items in the chat, or gives the current website, and the researcher reads it with Scrapling. The builder never invents a dish, an item or a price. A missing price becomes `[PRICE]`.

**What the screens show.** The proof of concept changes the data, not the screens. The seed gets one proof-of-concept account with the two squads, their skills and their events. The homepage and sign-up step 3 show the two new agents (design updated on 31 October 2026). The two agents' images appear on the Agent images screen as version 0.1.0, Beta. Two things the design does not show, decided on 31 October 2026: the Revenue and Orders tiles on Overview show "—" for an account with no store (decision 25); the site preview is a link in the chat only (decision 26).

**Done when:** one run passes both checks and both approvals on a real boat.dev machine, the page is live at `<slug>.10squads.com`, all thirteen events show on the traffic screen in order, and `make verify` returns 0.

## Risks and open items

| Risk | Effect | What this plan does |
| --- | --- | --- |
| The cordis API is not stable. Its README says so | A change in cordis could stop all plug-ins | We pin one commit. Only the `Kernel` module imports cordis. A decision record keeps the pin and the rule for updates |
| TanStack Start 1.0 is two weeks old | A framework bug can appear that an older framework would not have | The version is pinned. Phase 0 deploys an empty app first. The Cloudflare Vite plugin runs the same runtime on the laptop and in production. The Cloudflare build job runs on each pull request |
| Neon over HTTP from a Worker adds time to each query | Overview runs several total queries | The data layer groups the queries per screen. One request per page. We measure in phase 2 |
| Stripe Projects is in public preview | The CLI or the catalog can change | `.projects/state.json` is in git. The manual setup steps for Cloudflare, Neon and Clerk are in `docs/` |
| The design has no sign-in screen. Clerk has one | A screen exists that the design did not draw | Decided: Clerk elements with the design tokens. Phase 1 builds the sign-in form from the design tokens only |
| TLC needs Java. CI gets slower | Slow pull requests | Three measures in the verify section: the check runs only when a model or its code changes; the toolchain is cached; the models stay small and run in parallel. Fallback: a nightly schedule |
| `Main.dc.html` is 117 KB of inline styles | Exact screens depend on a full read each time | Only the seed module and the token script read it. The screenshot comparison proves the match |
| boat.dev costs about $26 per month for each always-on machine | Five agents per account, always on, is $130 per account per month | "Stop and resume" is the default. Always-on is for the Scale plan only, decided later |
| boat.dev publishes no uptime promise and no second region | A machine can stop without warning | The master core runs on Cloudflare, not on a machine (decision 17). Tasks wait in Queues. Heartbeats restart a machine. Ask boat.dev about host failure and regions before phase 4 |

**Open items.** None. Moe answered the last three on 31 October 2026: Clerk elements for sign-in (decision 13), the Cloudflare account that Stripe Projects links (decision 14), and his boat.dev account with a new `tensquads-agents` environment (decision 15).

**Sources.** [cordis](https://github.com/cordiverse/cordis) and its paper, arXiv 2608.25512. [pstack skills](https://github.com/cursor/plugins/tree/main/pstack/skills). [PI-Starter](https://github.com/moeghashim/PI-Starter). [Stripe Projects for developers](https://projects.dev/developers/) and its [provider catalog](https://projects.dev/llms.txt). [boat.dev platform guide](https://docs.boat.dev/platform-guide). The tensquads design canvas and the build brief from Moe.
