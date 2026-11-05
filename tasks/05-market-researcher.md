# Task 05 — Market researcher

Repository: `moeghashim/tensquads-market-researcher` (private). Branch: `05-market-researcher`. One pull request in that repository. This file stays in `moeghashim/tensquads`.

Start only when `moeghashim/tensquads-agent-kit` has released `0.1.0`. Also wait for the start rules in `tasks/05-agent-kit.md`. Read `AGENTS.md` in `moeghashim/tensquads` first and send the receipt. Decision 35 names this repository. Do not ask Moe to confirm the name or the visibility. Do not change `moeghashim/tensquads`.

## Goal

The Market researcher image can take one Task, run its skills through their gates, and send one Result. The master decides every pass. This repository does not.

## Read

- `docs/PLAN.md`: Decisions 16 to 28, 33, and 35. Also "Proof of concept".
- `docs/handoffs/poc-squad-repos.md`: "Market researcher" and "Rules for every agent".
- `tasks/05-agent-kit.md`
- `tasks/05-proof-of-concept.md`: the research check. Send the evidence that check needs. Do not decide the pass.
- `design/Main.dc.html`: the shape of an agent, a skill, and a bus event.

Where this file and the plan disagree on the skill list or on the model, this file wins. Moe decided that on 4 November 2026.

## The agent

- Agent id: `market`.
- Name on the screen: Machu (decision 33).
- Role tag: `Market researcher`. The design name stays the role tag.
- Role text: `Competitors and positioning`.
- Tint: `#fde2f3` (decision 27).
- Machine: one boat.dev machine, size `small`, always on.
- Model: a cheaper GPT-6 tier.
- Image: version `0.1.0`, status Beta. The tag is `registry.agents.co/market:0.1.0`. No customer pins a version.

The machine gets `ACCOUNT_ID`, `TENSQUADS_AGENT_ID`, and `IMAGE_TAG` only. Boat reserves `AGENT_ID` (`invalid_env`). Send `noEnv: true`. A machine does not pull a Cloudflare queue. It uses `/machine/send` and `/machine/take` from the kit client.

## Skills

| Skill | Tool | Gate |
| --- | --- | --- |
| `web.search` | context.dev Search | Auto |
| `maps.competitors` | context.dev `google-maps`, `google-maps-reviews`, `yelp-search` | Auto |
| `scrapling.read_page` | Scrapling service on boat.dev | Auto |
| `market.analyse` | The model | Auto |
| `report.write` | The model | Auto |
| `competition.watch` | context.dev monitor | Ask first |

The links for context.dev are open question 1. Do not call context.dev until Moe answers.

The Result carries the report, the sources, and the evidence.

What to look for:

- Restaurant: competitor menus, price ranges, cuisine, and how they present dishes.
- Grocer: competitor item lists, price ranges, delivery, and opening hours.

`competition.watch` makes one monitor per account, after the user says yes. The `change.detected` webhook goes to a Worker route in `moeghashim/tensquads`. It does not go to this repository.

## The check the master runs

This repository does not run the check. The Result must still carry the evidence.

- At least three competitors.
- Each competitor has a URL that returns 200.
- Each competitor has a price or an offer taken from its page, with the source URL.
- The report names one gap.

## Steps, in order

1. Create the private repository. Copy the PI-Starter checks. Pin `@tensquads/agent-kit` to the `0.1.0` commit with an npm git dependency.
2. Add the skills, the prompts, and the image. Each skill is a cordis plug-in (decision 18). Cordis stays pinned. One small module holds every cordis call.
3. Test each skill gate against the fake master from the kit.
4. Prove that `competition.watch` does not run before an Approval.
5. Prove that the agent keeps no task state between loops.
6. Stop when a step needs Moe's account, card, or a key. Give Moe the exact command. Do not paste a key.
7. Release the image. Unit tests and the image release do not wait for the Durable Object.
8. After open questions 1 and 2 are answered and the main repository has the heartbeat route, start the image on a real boat.dev machine with `noEnv: true`. The heartbeat must reach the Durable Object.

## Done when

- [ ] `make verify` returns 0 on the branch and in CI
- [ ] Each skill passes its gate tests against the fake master
- [ ] A test proves that `competition.watch` does not run before an Approval
- [ ] A test proves that the agent holds no task state between loops
- [ ] After the main repository has the heartbeat route, the image starts on a real boat.dev machine with `noEnv: true`, and its heartbeat reaches the Durable Object
- [ ] A scan finds no key in git, in logs, or in the image

## Do not

- Do not grade the report.
- Do not call the Website builder. The master sends this agent its Task.
- Do not write to Neon (decision 16).
- Do not invent a competitor, a price, or an offer. The page is the source.
- Do not put a key on the machine, in a prompt, in a log, or in git.
- Do not change `moeghashim/tensquads`.

## Open questions for Moe

Do not guess. Stop the step that needs the answer.

1. **The context.dev links.** Answered by Moe on 5 November 2026: the researcher uses context.dev for three things only: web search (`web.search`), map listings (`maps.competitors`: `google-maps`, `google-maps-reviews`, `yelp-search`), and watching competitors (`competition.watch`, a monitor). Use the nine pages below. All nine returned 200 on 5 November 2026.
   - Search: `https://docs.context.dev/search/overview`
   - Search API: `https://docs.context.dev/api-reference/web-scraping/search`
   - Pre-built parsers: `https://docs.context.dev/scrape/prebuilt-parsers`
   - `google-maps`: `https://docs.context.dev/scrape/prebuilt-parsers/google-maps`
   - `google-maps-reviews`: `https://docs.context.dev/scrape/prebuilt-parsers/google-maps-reviews`
   - `yelp-search`: `https://docs.context.dev/scrape/prebuilt-parsers/yelp-search`
   - Monitors: `https://docs.context.dev/monitors/overview`
   - Monitor events: `https://docs.context.dev/monitors/webhooks`
   - `change.detected` payload: `https://docs.context.dev/api-reference/monitors/webhook-payload`
2. **How the machine gets the signed token.** Same question as `tasks/05-agent-kit.md` question 1. Unit tests may pass a token in. The real machine step waits for Moe. *Recommended:* the boat.dev key proxy holds the token. The machine reads it at call time. It is not an environment variable.
