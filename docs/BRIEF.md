> This is the original brief. Its wording stays as supplied. Read [the build plan](PLAN.md) for decisions 1–28 and [the foundation guide](foundation.md) for the implemented phase 0 data model, inbox rules, and checks. The design controls screen copy.

Follow the framework https://github.com/cordiverse/cordis to make everything as a plugin more about this here https://arxiv.org/abs/2608.25512

Use domain driven design as a software architecture. 
Use anti corruption layer in the software
Use adversarial review for all none architectural requirements 

For skills use: 
https://agentskills.io/home as the structure and use https://github.com/cursor/plugins/tree/main/pstack/skills
Make sure to use and update statechart as the software evolves more details from pstack creator:
 
the /statechart skill in pstack v0.15.36 is now stable and ready for use! it's best combined with /create-formal-verification-skill to abstractly model state machines and distributed systems to find bugs.

the skill contains a mini tlc compiler that parses, lowers to a small IR, and has a backend that outputs mmd syntax. if you want you can also ask your agent to create charts in whatever style you like, the skills tells it to use https://pele.run which is very themeable so you can make blueprints, hand drawn encyclopedia illustrations or whatever you like

here's a chart of the /statechart skill and 2 real bugs i just found. try it out and let me know what you think!
Draw and update the chart as you make progress in the app.

Borrow everything you need from https://github.com/moeghashim/PI-Starter


You are building Business Agents, a SaaS product where a small business runs its operations through a squad of AI agents (Orders, Support, Marketing, Finance, Inventory) coordinated by one "master" agent. The whole product has already been designed, screen by screen, with mock data and working interactions. Your job is to turn that design into a working app. The design is the source of truth. Do not invent screens, copy, colours, layout, data fields or behaviour that the design does not show. When something is not settled by the design or by this brief, stop and ask; never guess.
Source of truth. The design lives in a Claude Design canvas: https://claude.ai/artifact/B7seDz5psECQTerDG6rfy4. Every screen is one .dc.html file under project/ in that artifact. Each file is self-contained HTML with inline styles and a small JavaScript class at the bottom that holds the mock data and the interaction logic. Read every file in full before writing any code. Treat the inline styles as the exact spec: pixel values, colours, radii, font sizes, spacing. Treat the JavaScript mock data as the exact shape of the data the app must handle, and the renderVals() function as the exact spec of each screen's behaviour. The files are listed in "Screens and routes" below.
Rules.
1. Build screens in the order listed in "Screens and routes". Do not start the next screen until the current one matches the design.
2. Reproduce every piece of visible copy exactly as written in the design, including placeholders in square brackets such as [CUSTOMER QUOTE]; leave those as-is, they are deliberate.
3. Reproduce every interaction listed in "Behaviour" exactly. If the design has a button, it must do what the design's logic does; if the design's logic does nothing for a control (for example "Roll out" and "View changelog" on the agent-images screen), wire it to a no-op and list it under "Not wired, by design" in your final report.
4. Use the design tokens in "Design tokens" and nothing else. No other colours, fonts, radii or shadows. No component library whose defaults leak through (no default focus rings, button styles or font smoothing from a UI kit).
5. Seed the database with the mock data from the design files, verbatim: the same account names, agents, skills, bus events, approvals, rules, limits, images, bugs and feature requests. Numbers in the design that are computed (totals, averages, percentages) must be computed by the app the same way, not hard-coded.
6. Anything listed under "Open decisions" is a question for Moe. Ask all of them before you write code, in one message, as a numbered list with your recommended answer for each. Do not proceed on an assumed answer.
7. If, while building, you find a conflict between two parts of the design, or a state the design does not show (an empty list, an error, a loading state), ask. Do not design it yourself.
8. Never report a screen as done because it "looks right". It is done when the verification steps in "Definition of done" pass.
The rest of this document is the brief you must follow.
Screens and routes
Ten screens, three shells. Build in this order. The "Design file" column is the file under project/ in the canvas; six of the workspace screens are thin wrappers that mount Main.dc.html with a different start-view, so the whole workspace, its sidebar and the chat dock live in Main.dc.html.
#
Screen
Shell
Design file
Suggested route
What it must do
1
Homepage
Public
Home.dc.html
/
Marketing page: sticky nav, hero with New/Existing toggle and prompt box, logo row, product preview, agent cards, how it works, control section, pricing, CTA band, footer. "Build my squad", "Start free" and plan buttons go to sign-up. "Sign in" goes to the workspace Overview.
2
Sign up: create your business
Public
Onboarding.dc.html
/signup
Three-step flow: business type (new / existing) → details (branching form) → first squad (pre-ticked agents). "Create my workspace" creates the account and opens Overview.
3
Overview
Workspace
Main.dc.html (start-view=overview)
/app
Greeting, 6 KPI tiles, 14-day revenue bars, approval inbox with Approve/Decline, agents-at-a-glance cards.
4
Chat with the master
Workspace
Chat.dc.html → Main start-view=chat
/app/chat
Message thread with the master and agents, suggestion chips, input, and a hand-offs side panel listing bus events from this chat.
5
Agents
Workspace
Agents.dc.html → Main start-view=agents
/app/agents
List of the account's agents with status, autonomy, tasks, skill chips. Click opens the agent dashboard.
6
Agent dashboard
Workspace
AgentDetail.dc.html → Main start-view=agents, start-agent=support
/app/agents/:id
One agent: on/off switch, KPIs, machine details, egress and secrets, skills with per-skill gate and switch, autonomy picker, that agent's bus events.
7
Agent traffic
Workspace
Traffic.dc.html → Main start-view=flow
/app/traffic
Hub diagram of master and agents, filter chips, event list, inspector with JSON payload and state writes, shared state table, Live/Paused toggle and Simulate button.
8
Rules and limits
Workspace
Rules.dc.html → Main start-view=rules
/app/rules
Rules list with switches, new-rule form (trigger, agent, approval), three limit sliders bound to shared state.
9
Platform admin: all accounts
Super-admin
Accounts.dc.html → Main start-view=admin
/admin
Totals row (8 tiles), accounts-created bar chart, plan mix, searchable and filterable accounts table with subscription, started date and all-time value. Row click opens that account's workspace.
10
Platform admin: agent images
Super-admin
AgentImages.dc.html → Main start-view=catalog
/admin/images
Totals row, filterable image table, detail panel with open bugs and requested features for the selected image.
Shells. Public pages have the top nav from Home.dc.html or the minimal header from Onboarding.dc.html. Workspace pages share the left sidebar from Main.dc.html (account header, five nav items, the agent list with status dots, user footer, the "All accounts" back link) and the floating chat dock. Super-admin pages share the "Platform admin" sidebar from Main.dc.html (Accounts, Agent images with attention badge, a "Coming next" list, Super admin footer) and have no chat dock.
Who sees what. A signed-in account owner sees screens 3–8 for their own account only. A super admin (our company) sees 9–10 and can open any account's workspace from the accounts table; the "All accounts" link in the workspace sidebar appears only for super admins.
Data model
The hierarchy is Platform → Account → Squad → Agent → Skill. Field names below are the ones used in the design's mock data in Main.dc.html; keep them, and copy the seed values from the file rather than from this table.
Entity
Fields in the design
Where it shows
Account
id, name, owner, email, plan (Starter / Growth / Scale), tint, squads (list of names), agents (count), online (count), tasks (7d), lastActive, status (Active / Trial / Paused), started, mrr, ltv, createdWeek
Accounts table, totals, plan mix, created-per-week chart
Squad
name; belongs to one account
Accounts table ("2 squads · Wholesale, Retail"), sign-up step 3
Agent
id, name, role, tint, on, autonomy (Ask first / Auto under limit / Full auto), tasks, success, saved, last, host, region, size, cpu, uptime, egress (list), secrets (list), kpis (label/value pairs), skills
Sidebar, Overview cards, Agents list, Agent dashboard, traffic hub
Skill
id (e.g. shopify.fulfill_order), desc, gate (Auto / Ask first / Under limit), runs, on
Agent dashboard skills list
Bus event
id, time, from, to, kind (Task / Result / Request / Relay / Escalation / Approval / Declined), skill, text, payload (object), writes (list of state keys), trace
Agent traffic, agent dashboard, chat hand-offs
Approval
id, agent, title, detail, amount; approving increments that agent's tasks and updates its last
Overview inbox, chat dock badge
Chat message
from (user / master / agent), agent (when from an agent), text
Chat page and chat dock (same thread)
Shared state (store)
key/value pairs such as order.A-1007.tracking, policy.refund_auto_limit, policy.daily_ad_cap, policy.reorder_limit
Traffic state table, Rules limit sliders
Rule
id, trigger, agent, approval, on
Rules page
Agent image
id, name, role, tint, tag (registry.agents.co/<id>:<version>), version, nextVersion, updated, updatedFull, deployed, onLatest, status (Stable / Needs attention / Beta / Draft), bugs, features
Agent images screen
Bug
id, sev (High / Medium / Low), title, age, reports
Agent images detail
Feature request
id, title, votes, stage (Backlog / Planned / In review / In progress)
Agent images detail
Master
one per account; name shown everywhere (default "Master")
Sidebar, chat, dock
Every agent runs on its own isolated machine with its own secrets and an egress allowlist; the design shows this on the agent dashboard (host, region, size, CPU, uptime, egress, secrets) and it should be modelled, not faked, even if the first version provisions nothing.
Behaviour
Each item is implemented in the design's JavaScript; read that code for the exact logic. This list is the checklist.
Homepage
• New / Existing toggle changes the prompt placeholder and the three example chips; clicking an example fills the box.
• All CTAs route as in the Screens table. Anchor links (#squad, #how, #control, #pricing) scroll to those sections.
Sign-up
• Step 1 choice sets the business type and pre-selects the starter squad: new → Marketing, Orders, Support; existing → Orders, Support, Finance, Inventory.
• Step 2 shows different fields per type (see the design). Chips are multi-select for channels and platforms, single-select for order volume.
• Step 3 lists five agents with a per-type "why" line; the summary line reads "N agents and one master will be created" and "Pick at least one agent to start" at zero. Back goes one step back.
• "Create my workspace" creates the account with its first squad, the chosen agents, a master, and default limits, then opens Overview.
Workspace, all pages
• Sidebar nav highlights the current page; agent rows show a green dot when on, grey when off, and open that agent's dashboard.
• Chat dock: a floating "Ask <Master>" button bottom-right. Closed with approvals waiting → orange badge with the count. Open → panel with the last six messages, three suggestion chips, input, "Open full chat". It shares the thread and draft with the chat page. Hidden on the chat page and on super-admin pages.
Overview
• KPI "Tasks done by agents" is the sum of every agent's tasks. The online pill counts agents with on.
• Approve adds one task to that agent and sets its last to the approval title plus " (approved)"; Decline removes it. Empty inbox shows the "Nothing waiting" copy.
Chat
• Sending a message appends the user bubble, shows "<Agent> agent is working on it…", then a master reply and a bus event, following the scripted replies in send(). Enter sends.
Agents and agent dashboard
• Agent on/off switch, per-skill on/off switches, and the autonomy picker all update state immediately. Off → CPU shows 0% and uptime "Paused".
Agent traffic
• Clicking a hub node filters the event list to that agent; clicking again clears. Clicking an event selects it and the inspector shows route, skill, trace, JSON payload and state writes.
• Live toggle and Simulate both step through nextEvent(), which appends the next scripted event and applies its writes to the shared state.
Rules and limits
• Rule switches toggle on. The new-rule form has trigger, agent and approval selects. The three sliders write to policy.refund_auto_limit, policy.daily_ad_cap, policy.reorder_limit and the traffic state table reflects it.
Super-admin: accounts
• Search matches name, owner and email. Status filters: All / Active / Trial / Paused. Totals are computed from the full list, not the filtered one. The bar chart counts accounts by createdWeek 0–7; -1 means older. Row click opens that account's workspace as that account.
Super-admin: agent images
• Filters: All / Needs attention / With bugs / With requests. Selecting a row fills the detail panel. "On latest" shows onLatest of deployed (pct%) or "Not deployed yet". The sidebar badge counts images with status "Needs attention".
• "Roll out" and "View changelog" are not wired in the design.
Design tokens
These are the values used throughout the design files. The full token set is in project/ds/agent-ui/tokens.json in the canvas; where that file and this table differ, the inline styles in the .dc.html files win.
Token
Value
Used for
Page background
#f3f3f3
Workspace canvas, sign-up page
Surface
#fcfcfc with 0.5px #ededed border
Workspace main panel, homepage body
Card
#fff, radius 16px (12px for KPI tiles), ring 0 0 0 1px rgba(13,13,13,.08)
All cards and tables
Inset
#f9f9f9, radius 12px
Approval cards, bug and feature rows
Primary
#181818 (hover #000), text #fff, radius 999px
Primary buttons, selected chips, hero prompt "Build my squad"
Soft button
rgba(13,13,13,.08), hover .12
Decline, Back, secondary actions
Text
#0d0d0d headings, #282828 body, #414141 nav, #5d5d5d secondary, #8f8f8f muted
Everywhere
Link
#0169cc, hover #004f99
Links, "Open full chat", section eyebrows
Green
bg #04b84c14, text #00692a, dot #00a240
Online, Active, Stable, Auto
Blue
bg #0285ff14, text #004f99
Growth plan, Task/Request, Beta, In review
Purple
bg #924ff714, text #532d8d
Relay, In progress
Orange
bg #fb6a2214, text #923b0f
Escalation, Trial, Ask first, Medium
Red
bg #fa423e14, text #911e1b
Declined, Needs attention, High
Agent tints
Orders #e7efff, Support #def5ee, Marketing #ece3ff, Finance #ffefa4, Inventory #fee7c2
Agent avatars and chips
Font
Inter 400/500/600/700, -0.01em tracking; headings -0.02em to -0.035em
All UI
Mono
JetBrains Mono 400/500
Skill ids, image tags, hosts, payloads
Sizes
body 14px/20px (workspace) and 15px/22px (public); h1 28px/34px workspace, 64px/68px hero; section h2 40px/46px; KPI value 24px/30px
See files
Pills
height 22px, padding 0 8px, 12px 500
Status, kind, plan, gate
Nav item
min-height 40px, radius 8px, selected rgba(13,13,13,.08) + 600
Sidebars
Focus
2px solid #0169cc, offset 2px
All focusable controls
Layout
Sidebar 200–260px, main flex: 999 1 560px; page width 1280–1440; content max 1200px on public pages; wide tables scroll inside an overflow-x: auto box
Responsive down to phone width
No gradients, no emoji, no icon font: icons are inline 16px stroke SVGs at 1.5px, copied from the design.
Open decisions
The design does not settle these. The agent must ask Moe all of them in its first message, with a recommended answer for each, and wait.
1. Stack. Framework, language, database, hosting. The design is plain HTML and JavaScript and implies nothing.
2. Authentication. How account owners and super admins sign in; whether "Sign in" on the homepage is email + password, magic link or a provider. The design has no sign-in screen.
3. Multi-tenancy. One database with an account_id on every row, or one schema per account. Affects how a super admin "opens" an account's workspace.
4. Real agents or scripted. Whether the first build runs real LLM agents on real machines, or ships the scripted behaviour from the design (send(), nextEvent()) behind the same interfaces. Recommended: scripted first, same data model, so the UI is exact before any agent runtime exists.
5. Integrations. Which store, inbox and ads connections (Shopify, Printify, Gmail, Meta Ads, Klaviyo, Canva, Stripe, QuickBooks) are real in version one and which are placeholders. The sign-up flow promises to "connect these on the next step" but that step is not designed.
6. Billing. Whether plans and the 14-day trial are enforced (Stripe?) or recorded only. Prices in the design: Starter $49, Growth $149, Scale $399 per month.
7. Squads beyond one. The workspace screens show one squad per account. How a second squad is created and switched to is not designed.
8. Empty, loading and error states. None are designed except the empty approval inbox and empty search results. Ask before designing any.
9. Mobile. The design works at phone width (menus stack, tables scroll) but no phone layout is drawn. Confirm that stacking is acceptable or stop.
10. Placeholders. [CUSTOMER QUOTE], [CUSTOMER NAME], [BUSINESS], [TERMS], [PRIVACY POLICY], [VAT NOTE], [COMPANY LEGAL NAME] need real values or must stay as-is.
11. Not-wired controls. "Roll out <version>", "View changelog", the admin "Coming next" items, the pricing "Talk to us" button and the footer Company links do nothing in the design. Leave as no-ops, hide, or specify.
Definition of done
A screen is done only when all of these pass. Report the evidence, not a summary.
[ ] A side-by-side screenshot of the built screen at 1440px wide against the design artboard at the same width, with no visible difference in layout, spacing, colour or copy. Attach both images.
[ ] Every item for that screen in "Behaviour" exercised in an automated end-to-end test (Playwright or equivalent) that passes in CI.
[ ] Computed numbers (totals, counts, percentages) match the design's mock values when the seed data is loaded: Accounts 9, Agents 66, Squads 17, Monthly recurring $1,294, All-time value $14,568; Overview "Tasks done by agents" 331; Agent images 7, Open bugs 8, Features requested 15.
[ ] Keyboard: every control reachable with Tab, every icon-only button has an aria-label, inputs have labels, focus ring is the 2px #0169cc one.
[ ] The page works at 390px wide with no horizontal scroll except inside the designated table boxes.
[ ] make verify (lint, type-check, unit and e2e tests) exits 0. The screen is not done on a self-report.
When all ten screens pass, the final report lists: every open decision and the answer received; every control left as a no-op; every place the built app deliberately differs from the design and who approved it. Nothing else counts as a difference that may ship.

https://claude.ai/artifact/Y49qD3KV9FVUG8eedeXEKR#4b9d9a66-40ed.mje25dggbwa.9432

Don't build agents now. Just build the system.
