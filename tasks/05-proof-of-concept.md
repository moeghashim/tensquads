# Task 05 — Proof of concept (phase 5)

Branch: `05-proof-of-concept`. Starts only when tasks 00 to 04 are merged. Read `AGENTS.md` first and send the receipt.

## Goal

Three real squads run one full loop for a restaurant or a grocer: the Market researcher finds and analyses the competitors, the master writes a brief and asks the user, the Website builder makes one page, the master asks the user again, the page goes live at `<slug>.tensquads.co`. Every step is a bus event. Every result passes a check that code runs. Decisions 20 to 31 in `docs/PLAN.md` govern this task.

## Read

- `docs/PLAN.md`: Decisions 16 to 31, "How agents send messages", "Where the master runs", "The agent loop and verified outcomes", "Proof of concept" (all of it)
- `docs/BRIEF.md`: Data model (Agent, Skill, Bus event, Approval), Behaviour (Chat, Agent traffic)
- `design/Main.dc.html`: the script, for the shape of agents, skills, bus events and approvals
- The context.dev docs the plan links: Search, prebuilt parsers, Web Search Monitors
- The impeccable README

## The three squads

| Squad | Runs where | Skills, with gate | Model |
| --- | --- | --- | --- |
| Master | Cloudflare: the account's Durable Object and a Worker (decision 17) | `brief.write` Auto · `task.route` Auto · `approval.ask` Auto · `check.run` Auto | A cheaper GPT-6 tier |
| Market researcher | One boat.dev machine, size `small`, always on (decision 17) | `web.search` (context.dev Search) Auto · `maps.competitors` (context.dev `google-maps`, `google-maps-reviews`, `yelp-search`) Auto · `scrapling.read_page` Auto · `market.analyse` Auto · `report.write` Auto · `competition.watch` (context.dev monitor) Ask first | A cheaper GPT-6 tier |
| Website builder | One boat.dev machine, size `small`, always on | `site.build` Auto · `site.critique` (impeccable) Auto · `site.preview` Auto · `site.publish` Ask first | GPT-6 Astra (decision 24) |

All keys (OpenAI, context.dev, Scrapling, Cloudflare Pages) live in the boat.dev key proxy and in Worker secrets. No key enters a machine or a prompt.

## The loop, step by step

1. The user types the business name, picks restaurant or grocer, and pastes the menu or the item list, or gives the current website. The master makes a Task for the researcher.
2. The researcher: `web.search` for the business and its competitors; `maps.competitors` with a Google Maps search URL for the business type near the business; `scrapling.read_page` on each competitor's own site; `market.analyse` with the model; `report.write`. It sends a Result with the report, the sources and the evidence.
3. The master runs the check (below). On a pass it writes the brief (under 150 words, names the gap) and sends an Approval: "Build the site with this brief?"
4. The user approves. The master makes a Task for the builder with the brief, the report and the menu or item list.
5. The builder: `site.build` with GPT-6 Astra; for a restaurant, a menu page with top design and UX and a cultural touch when the restaurant is cultural, no cliché; for a grocer, a one-page item list with sections. `site.critique` with impeccable, apply the fixes, run `npx impeccable detect`. `site.preview`. It sends a Result with the preview URL.
6. The master runs the check. On a pass it sends an Approval: "Publish the site?"
7. The user approves. The builder runs `site.publish` to Cloudflare Pages at `<slug>.tensquads.co`. It sends a Result.
8. The researcher offers `competition.watch`. On the user's yes it makes one context.dev monitor for the account. Each `change.detected` webhook reaches a Worker endpoint and becomes a bus event to the master.

## The checks that code runs

| Result | The check |
| --- | --- |
| Research report | At least three competitors. Each has a URL that returns 200. Each has a price or an offer taken from its page, with the source URL. The report names one gap |
| Brief | Under 150 words. Names the gap from the report |
| Page | The preview URL returns 200. The page has the business name. Every menu item or grocery item from the user's list has a name and a price; a missing price reads `[PRICE]`; no item was invented. The cuisine from step 1 appears on a restaurant page. No link is broken. Keyboard and contrast checks pass. `npx impeccable detect` reports no P0 or P1 finding. At 390 px there is no horizontal scroll |
| Published site | `https://<slug>.tensquads.co` returns 200 and the same content as the preview |

A failed check sends the task back once with the evidence. A second fail makes an Escalation to the user. The agent never grades its own work (decision 20).

## What the screens show

See `docs/PLAN.md` "Proof of concept" and the screen-by-screen table that follows it. The proof of concept changes the data, not the screens. Add one proof-of-concept account to the seed with the two squads, their skills and their thirteen events. The Revenue and Orders tiles show "—" (decision 25). The site preview is a link in the chat (decision 26).

## Done when

- [ ] One run passes both checks and both approvals on real boat.dev machines
- [ ] The page is live at `<slug>.tensquads.co`
- [ ] All thirteen events show on the traffic screen in sequence order, with payloads and state writes in the inspector
- [ ] The agent dashboard for each squad shows real host, CPU and uptime from boat.dev, and the skill run counts
- [ ] `competition.watch` makes one monitor, and one test `change.detected` webhook becomes a bus event
- [ ] The Agent loop state model has no broken rule for this run
- [ ] `make verify` returns 0

## Do not

- Do not invent a dish, an item or a price. The user's list is the only source.
- Do not let an agent write to Neon. Only the Durable Object writes (decision 16).
- Do not change any of the ten product screens.
- Do not add ClickHouse here. That is after this phase (decision 31).
