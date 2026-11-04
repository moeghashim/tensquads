# Task 05 — Website builder

Repository: `moeghashim/tensquads-website-builder` (private). Branch: `05-website-builder`. One pull request in that repository. This file stays in `moeghashim/tensquads`.

Start only when `moeghashim/tensquads-agent-kit` has released `0.1.0`. Also wait for the start rules in `tasks/05-agent-kit.md`. Read `AGENTS.md` in `moeghashim/tensquads` first and send the receipt. Decision 35 names this repository. Do not ask Moe to confirm the name or the visibility. Do not change `moeghashim/tensquads`.

## Goal

The Website builder image can take one Task, build one page, and send one Result with the preview URL. It publishes only after an Approval. The master decides every pass. This repository does not.

## Read

- `docs/PLAN.md`: Decisions 16 to 28, 33, and 35. Also "Proof of concept".
- `docs/handoffs/poc-squad-repos.md`: "Website builder" and "Rules for every agent".
- `tasks/05-agent-kit.md`
- `tasks/05-proof-of-concept.md`: the page check and the published-site check.
- The impeccable README. `site.critique` uses that skill.
- `design/Main.dc.html`: the shape of an agent, a skill, and a bus event.

Where this file and the plan disagree on the skill list or on GPT-6 Astra, this file wins. Moe decided that on 4 November 2026.

## The agent

- Agent id: `website`.
- Name on the screen: Angkor (decision 33).
- Role tag: `Website builder`.
- Role text: `Landing pages and site updates`.
- Tint: `#e5e9f0` (decision 27).
- Machine: one boat.dev machine, size `small`, always on.
- Model: GPT-6 Astra.
- Image: version `0.1.0`, status Beta. The tag is `registry.agents.co/website:0.1.0`. No customer pins a version.

The machine gets `ACCOUNT_ID`, `TENSQUADS_AGENT_ID`, and `IMAGE_TAG` only. Boat reserves `AGENT_ID` (`invalid_env`). Send `noEnv: true`. A machine does not pull a Cloudflare queue. It uses `/machine/send` and `/machine/take` from the kit client.

The Task from the master carries the brief, the research report, and the menu or item list. This agent does not call the Market researcher.

## Skills

| Skill | Tool | Gate |
| --- | --- | --- |
| `site.build` | The model, GPT-6 Astra | Auto |
| `site.critique` | impeccable | Auto |
| `site.preview` | Preview host | Auto |
| `site.publish` | Cloudflare Pages at `<slug>.10squads.com` | Ask first |

What to build:

- Restaurant: a menu page. Top design and UX. Add a cultural touch when the restaurant is cultural. Type, colours, and layout follow the cuisine. Use no cliché.
- Grocer: a one-page list of the items, with prices and sections.

Rules for the page:

- The user's list is the only source. Never invent a dish, an item, or a price.
- A missing price reads `[PRICE]`.
- After `site.critique`, apply the fixes. Then run `npx impeccable detect`.
- The tensquads design tokens do not apply to a customer page. They apply to the product screens.
- The site preview reaches the user as a link in the chat only (decision 26). This agent sends the URL. It does not add a product screen.

## The check the master runs

This repository does not run the check. The Result must still carry the evidence.

Page:

- The preview URL returns 200.
- The page has the business name.
- Every item from the user's list has a name and a price.
- No item was invented.
- A restaurant page shows the cuisine from step 1.
- No link is broken.
- Keyboard and contrast checks pass.
- `npx impeccable detect` reports no P0 or P1 finding.
- At 390 px there is no horizontal scroll.

Published site:

- `https://<slug>.10squads.com` returns 200.
- The content is the same as the preview.

## Steps, in order

1. Create the private repository. Copy the PI-Starter checks. Pin `@tensquads/agent-kit` to the `0.1.0` commit with an npm git dependency.
2. Add the skills, the prompts, the impeccable use, and the image. Each skill is a cordis plug-in (decision 18). Cordis stays pinned. One small module holds every cordis call.
3. Test each skill gate against the fake master from the kit.
4. Prove that `site.publish` does not run before an Approval.
5. Prove that the agent keeps no task state between loops.
6. Stop when a step needs Moe's account, card, or a key. Give Moe the exact command. Do not paste a key.
7. Release the image. Unit tests and the image release do not wait for the Durable Object.
8. After open question 1 is answered and the main repository has the heartbeat route, start the image on a real boat.dev machine with `noEnv: true`. The heartbeat must reach the Durable Object.

## Done when

- [ ] `make verify` returns 0 on the branch and in CI
- [ ] Each skill passes its gate tests against the fake master
- [ ] A test proves that `site.publish` does not run before an Approval
- [ ] A test proves that the agent holds no task state between loops
- [ ] After the main repository has the heartbeat route, the image starts on a real boat.dev machine with `noEnv: true`, and its heartbeat reaches the Durable Object
- [ ] A scan finds no key in git, in logs, or in the image

## Do not

- Do not grade the page.
- Do not call the Market researcher.
- Do not write to Neon (decision 16).
- Do not invent a dish, an item, or a price.
- Do not put a key on the machine, in a prompt, in a log, or in git.
- Do not change a tensquads product screen.
- Do not change `moeghashim/tensquads`.

## Open questions for Moe

Do not guess. Stop the step that needs the answer.

1. **How the machine gets the signed token.** Same question as `tasks/05-agent-kit.md` question 1. Unit tests may pass a token in. The real machine step waits for Moe. *Recommended:* the boat.dev key proxy holds the token. The machine reads it at call time. It is not an environment variable.
