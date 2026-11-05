# Task 05 — Proof of concept (phase 5, main repository)

Branch: `05-proof-of-concept` in `moeghashim/tensquads`. One pull request. Starts only when tasks 00 to 04 are merged. The token signer and the heartbeat route may start before either agent image is released. The full loop, the seed, and the "Done when" list wait for the kit `0.1.0` commit and both released images. Read `AGENTS.md` first and send the receipt.

This file is the main-repository task. It replaces the old single phase 5 task for this repository. The kit, the Market researcher, and the Website builder are the other three phase 5 files. The "Done when" list below is the final gate for the whole proof of concept.

## Goal

The master runs one full loop for a restaurant or a grocer. The Market researcher finds and analyses the competitors. The master writes a brief and asks the user. The Website builder makes one page. The master asks the user again. The page goes live at `<slug>.10squads.com`. Every step is a bus event. Every result passes a check that code runs. Decisions 20 to 28 and 35 govern this task. Decision 31 says version 1 uses one database, Neon.

## Read

- `docs/PLAN.md`: Decisions 16 to 28 and 32 to 35. Also "How agents send messages", "Where the master runs", "The agent loop and verified outcomes", and "Proof of concept".
- `docs/BRIEF.md`: Data model (Agent, Skill, Bus event, Approval). Behaviour (Chat, Agent traffic).
- `docs/handoffs/poc-squad-repos.md`: "What stays in `moeghashim/tensquads`".
- `docs/adrs/0002-poc-repositories.md`
- `tasks/05-agent-kit.md`, `tasks/05-market-researcher.md`, and `tasks/05-website-builder.md`
- `design/Main.dc.html`: the script, for the shape of agents, skills, bus events, and approvals.

Where the plan and this file disagree on the skill list or on GPT-6 Astra, this file wins. Moe decided that on 4 November 2026.

## What this repository builds

- The master skills: `brief.write`, `task.route`, `approval.ask`, and `check.run`. The model is a cheaper GPT-6 tier. All four gates are Auto.
- Every check below. An agent repository holds no check that decides a pass.
- The Durable Object side of the heartbeat. Three missed heartbeats resume the machine (decision 17). The path is `POST /machine/heartbeat` (open question 6, answered).
- The `change.detected` Worker route. A test webhook becomes one bus event to the master.
- The proof-of-concept seed account, with the two squads, their skills, and their events. The event list is open question 2.
- The two images on the Agent images screen, version `0.1.0`, status Beta. The ids are `market` and `website`.
- The end-to-end run.

The master runs on Cloudflare as the account Durable Object and a Worker (decision 17). It does not run on a boat.dev machine.

Agent ids stay `market` and `website`. On a screen, the character names are Machu and Angkor (decision 33). The role tags stay "Market researcher" and "Website builder".

Before the full loop and the seed, pin `@tensquads/agent-kit` to the `0.1.0` commit. Pin both released images.

## Facts from task 04

- The machine gets `ACCOUNT_ID`, `TENSQUADS_AGENT_ID`, and `IMAGE_TAG`. Boat reserves `AGENT_ID` (`invalid_env`).
- A machine sends to `/machine/send` and takes tasks from `/machine/take`. It does not pull a Cloudflare queue.
- Both routes use a signed token for one account and one agent. How the machine gets that token is open question 5.
- "How agents send messages" still says a machine pulls a queue over HTTP. Do not follow that sentence for a machine. Do not edit that sentence in this task.

## The loop, step by step

1. The user types the business name, picks restaurant or grocer, and pastes the menu or the item list, or gives the current website. The master makes a Task for the researcher.
2. The researcher runs `web.search`, `maps.competitors`, `scrapling.read_page`, `market.analyse`, and `report.write`. It sends a Result with the report, the sources, and the evidence.
3. The master runs the research check. On a pass it writes the brief. The brief is under 150 words and names the gap. The master sends an Approval: "Build the site with this brief?"
4. The user approves. The master makes a Task for the builder. The Task carries the brief, the report, and the menu or item list.
5. The builder runs `site.build` with GPT-6 Astra, then `site.critique`, then `site.preview`. It sends a Result with the preview URL.
6. The master runs the page check. On a pass it sends an Approval: "Publish the site?"
7. The user approves. The builder runs `site.publish` to Cloudflare Pages at `<slug>.10squads.com`. It sends a Result.
8. The researcher offers `competition.watch`. On the user's yes it makes one context.dev monitor for the account. Each `change.detected` webhook hits the Worker route and becomes a bus event to the master.

A failed check sends the task back once with the evidence. A second fail makes an Escalation to the user. The agent never grades its own work (decision 20). Each Approval records a Mandate (decision 32).

## The checks that code runs

Research report:

- At least three competitors.
- Each competitor has a URL that returns 200.
- Each competitor has a price or an offer taken from its page, with the source URL.
- The report names one gap.

Brief:

- Under 150 words.
- Names the gap from the report.

Page:

- The preview URL returns 200.
- The page has the business name.
- Every menu item or grocery item from the user's list has a name and a price.
- A missing price reads `[PRICE]`.
- No item was invented.
- The cuisine from step 1 appears on a restaurant page.
- No link is broken.
- Keyboard and contrast checks pass.
- `npx impeccable detect` reports no P0 or P1 finding.
- At 390 px there is no horizontal scroll.

Published site:

- `https://<slug>.10squads.com` returns 200.
- The content is the same as the preview.

## What the screens show

The proof of concept changes the data, not the screens. Do not change any of the ten product screens. The seed work waits for open questions 2 and 4. Two decisions already fix two screen facts. The Revenue and Orders tiles show "—" (decision 25). The site preview is a link in the chat (decision 26).

## Done when

- [ ] One run passes both checks and both approvals on real boat.dev machines
- [ ] The page is live at `<slug>.10squads.com`
- [ ] All thirteen events show on the traffic screen in sequence order, with payloads and state writes in the inspector
- [ ] The agent dashboard for each squad shows real host, CPU and uptime from boat.dev, and the skill run counts
- [ ] `competition.watch` makes one monitor, and one test `change.detected` webhook becomes a bus event
- [ ] The Agent loop state model has no broken rule for this run
- [ ] `make verify` returns 0

## Do not

- Do not invent a dish, an item, or a price. The user's list is the only source.
- Do not let an agent write to Neon. Only the Durable Object writes (decision 16).
- Do not change any of the ten product screens.
- Do not add ClickHouse. Decision 31 keeps it out of version 1.
- Do not build the researcher skills or the builder skills. Those repositories do that work.
- Do not put a key on a machine, in a prompt, in a log, or in git.

## Open questions for Moe

Do not guess. Stop the step that needs the answer. The other steps may proceed.

1. **Decision 31.** Answered by Moe on 5 November 2026. Version 1 uses one database, Neon. ClickHouse comes after phase 5. See decision 31 in `docs/PLAN.md`.
2. **The thirteen events.** Answered by Moe on 5 November 2026: seed these thirteen events, in this order, with one addition to event 9. The done list requires them on the traffic screen. `site.critique` is evidence inside event 10. It is not its own event. `competition.watch` and the test `change.detected` event come after these thirteen. They are not part of the thirteen.
   1. Task, master to market, `task.route`. Research this business.
   2. Result, market to master, `web.search`.
   3. Result, market to master, `maps.competitors`.
   4. Result, market to master, `scrapling.read_page`.
   5. Result, market to master, `market.analyse`.
   6. Result, market to master, `report.write`. The report, the sources, and the evidence.
   7. Approval, master to user, `brief.write`. "Build the site with this brief?"
   8. Approval, master to website, `approval.ask`. The user said yes. The payload holds the Mandate.
   9. Task, master to website, `task.route`. Build the page. The text and the payload state the research finding that the instructions rely on: the gap that the report names, with its source URL. Moe added this on 5 November 2026.
   10. Result, website to master, `site.preview`. The preview URL, after build and critique.
   11. Approval, master to user, `approval.ask`. "Publish the site?"
   12. Approval, master to website, `approval.ask`. The user said yes. The payload holds the Mandate.
   13. Result, website to master, `site.publish`. The live URL.
3. **The context.dev links.** Answered by Moe on 5 November 2026: the researcher uses context.dev for three things only: web search (`web.search`), map listings (`maps.competitors`: `google-maps`, `google-maps-reviews`, `yelp-search`), and watching competitors (`competition.watch`, a monitor). Use the nine pages in `tasks/05-market-researcher.md` question 1. All nine returned 200 on 5 November 2026. The `change.detected` Worker route uses the payload page `https://docs.context.dev/api-reference/monitors/webhook-payload`.
4. **The screen-by-screen table.** Answered by Moe on 5 November 2026: accept this table. Phase 5 changes seed data only. It does not change a layout.
   - Homepage: no change here. Decision 24 already shows the two agents. Task 07 owns the new homepage.
   - Sign-up: no change. Step 3 already shows the two agents.
   - Sign-in: no change.
   - Overview: for this account, Revenue and Orders show "—" (decision 25). The layout does not move.
   - Chat: the site preview is a link in the thread (decision 26). No new panel.
   - Agents: the seed adds the two agents. The layout does not change.
   - Agent dashboard: the same fields show real host, CPU, and uptime, and the skill run counts. No new control.
   - Traffic: the thirteen events show in sequence order. The inspector shows the payload and the state writes. The layout does not change.
   - Rules: no change.
   - Accounts: the seed adds one proof-of-concept account. The layout does not change.
   - Agent images: two images, version `0.1.0`, status Beta. The layout does not change.
5. **How a machine gets the signed token.** Answered by Moe on 5 November 2026: the Worker signs the token with the Worker secret `MACHINE_TOKEN_KEY`, for one account and one agent. The boat.dev key proxy holds the token. The machine reads it from the proxy at call time. It is not an environment variable, and the image does not contain it. Adjusted by Moe on 5 November 2026: boat.dev delivers the token through a custom API. The machine sees only a placeholder environment variable (`TENSQUADS_MACHINE_TOKEN`) and its base URL (`TENSQUADS_MACHINE_TOKEN_BASE_URL`). It sends the placeholder to that base URL, and boat.dev substitutes the real token on the way out. The real token never reaches the machine.
6. **The heartbeat route.** Answered by Moe on 5 November 2026: `POST /machine/heartbeat`, with the same signed token, once a minute. The body names the account and `TENSQUADS_AGENT_ID`. The main repository owns the route and the Durable Object records the time. After three missed minutes the master resumes the machine.
