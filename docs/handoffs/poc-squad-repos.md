# Handoff: proof-of-concept squads in their own repositories

Date: 31 October 2026. Owner: Moe Ghashim.

Do not start this work yet. Start it when every item in "When to start" is true.

## The request

Moe wants each proof-of-concept agent, except the master, to have:

- its own repository
- its own development thread

The two agents are the Market researcher and the Website builder. The master stays in `moeghashim/tensquads`. It runs on Cloudflare (decision 17).

This changes how `tasks/05-proof-of-concept.md` is delivered. It does not change what the proof of concept does.

## When to start

- [ ] Tasks 00 to 04 are merged in `moeghashim/tensquads`.
- [ ] The boat.dev adapter works. It can make a template and start a machine from a template.
- [ ] The Cloudflare bus adapter works. A machine can send to the Worker endpoint and pull from a queue over HTTP.
- [ ] Moe answered every item in "Decisions for Moe".
- [ ] Moe filled every gap in "Gaps in the source documents".

If an item is false, stop and tell Moe which one.

## Decisions for Moe

Answer these before the first thread starts. Each has one recommended answer.

1. **Repository names.** Recommended: `moeghashim/tensquads-market-researcher` and `moeghashim/tensquads-website-builder`.
2. **Visibility.** Recommended: private. An image holds our prompts and skills. A private repository needs access to the kit in item 3.
3. **Shared code.** Both agents need the same bus contract and the same agent loop. Recommended: a third new repository, `moeghashim/tensquads-agent-kit`. All three consumers pin it to one commit with an npm git dependency. This needs no package registry and keeps one copy of the loop. It is one more repository than Moe asked for.
4. **Decision record.** Recommended: add this split to the decisions table in `docs/PLAN.md` as a new decision, and record it in `docs/adrs/`. `AGENTS.md` says the architecture is fixed by that table.
5. **Task file.** Recommended: replace `tasks/05-proof-of-concept.md` with four task files, one for each row in "Who builds what". Its "Done when" list stays the final gate.

## Who builds what

| Work | Repository | Thread |
| --- | --- | --- |
| Bus contract, report and page types, agent loop, heartbeat, fake master for tests | `tensquads-agent-kit` | Kit thread |
| Market researcher skills, prompts, image, unit tests | `tensquads-market-researcher` | Researcher thread |
| Website builder skills, prompts, impeccable use, image, unit tests | `tensquads-website-builder` | Builder thread |
| Master core, routing, brief, approvals, all checks, `change.detected` endpoint, seed, screens, end-to-end run | `tensquads` | Main thread |

Order:

1. The kit thread releases version 0.1.0 first. The contract must exist before the agents use it.
2. The researcher and builder threads run after that. They can run at the same time.
3. The main thread runs the full loop last.

## Rules for every repository

These rules come from `AGENTS.md`, `docs/PLAN.md` and `tasks/05-proof-of-concept.md`.

1. Decisions 16 to 28 still apply. Read them in `docs/PLAN.md`.
2. Each repository copies the PI-Starter checks: strict TypeScript, Biome, husky, `progress.md`, `no-mistakes`, DCO, and `make verify`.
3. One task, one branch, one pull request. Push with `git push no-mistakes`.
4. A planner writes the task. A builder builds it. A reviewer who does not see the builder's notes tries to find faults.
5. Write in Simplified Technical English.
6. Commit as Moe Ghashim <mohanadgh@gmail.com> with a `Signed-off-by` trailer.
7. Exit code 0 from `make verify` is the only proof. CI runs the same command.

## Rules for every agent

1. **The loop.** Take a task. Plan. Run one skill at a time through its gate. Collect evidence. Send a Result. Go back to the start (decision 20).
2. **No self-grading.** The master core runs every check. The agent repositories hold no check that decides a pass. An agent may run a tool and send its output as evidence.
3. **Hub and spoke.** A squad talks only to the master. The Website builder gets the research report in its Task. It never calls the researcher.
4. **No state on the machine.** The agent keeps nothing between loops. Every result goes to the bus at once.
5. **No database access.** An agent never writes to Neon. Only the Durable Object writes (decision 16).
6. **No keys.** No key enters a machine, a prompt, a log or git. The boat.dev key proxy holds them. The machine gets only `ACCOUNT_ID`, `AGENT_ID` and `IMAGE_TAG`, with `noEnv: true`.
7. **Gates.** A skill with the gate Ask first never runs before an Approval.
8. **Runtime.** Size `small`, a systemd service, and one heartbeat to the account's Durable Object every minute (decision 17).
9. **Updates.** A skill is a cordis plug-in, so a skill update needs no restart. Cordis is pinned to one commit, and one small module holds all calls to it (decision 18).
10. **Rollout.** The image version starts at 0.1.0, status Beta. The tag follows `registry.agents.co/<id>:<version>`. No customer pins a version.

## The kit

Build these and nothing else:

- The bus event type, with the field names from `design/Main.dc.html`: `id`, `time`, `from`, `to`, `kind`, `skill`, `text`, `payload`, `writes`, `trace`.
- The Task and Result payloads for both agents.
- The types for the research report, the brief, the menu or item list, and the page result.
- The agent loop, with a skill interface and the gates Auto, Ask first and Under limit.
- The HTTP client for the Worker endpoint and the queue pull.
- The heartbeat.
- A fake master for tests in the agent repositories.

Rules:

- Tag each release. A consumer pins one commit.
- A change to the contract is a new version. Update all consumers in separate pull requests.
- The main repository is the owner of the master. The kit holds no master logic and no check.

## Market researcher

- Agent id: `market`. Name: `Market researcher`. Role: `Competitors and positioning`. Tint: `#fde2f3`.
- Machine: one boat.dev machine, size `small`, always on.
- Model: a cheaper GPT-6 tier.

| Skill | Tool | Gate |
| --- | --- | --- |
| `web.search` | context.dev Search | Auto |
| `maps.competitors` | context.dev `google-maps`, `google-maps-reviews`, `yelp-search` | Auto |
| `scrapling.read_page` | Scrapling service on boat.dev | Auto |
| `market.analyse` | The model | Auto |
| `report.write` | The model | Auto |
| `competition.watch` | context.dev monitor | Ask first |

The Result carries the report, the sources and the evidence.

The master checks the report:

- At least three competitors.
- Each competitor has a URL that returns 200.
- Each competitor has a price or an offer taken from its page, with the source URL.
- The report names one gap.

What to look for:

- Restaurant: competitor menus, price ranges, cuisine, how they present dishes.
- Grocer: competitor item lists, price ranges, delivery and opening hours.

`competition.watch` makes one monitor per account, after the user says yes. The `change.detected` webhook reaches a Worker endpoint in the main repository, not this repository.

## Website builder

- Agent id: `website`. Name: `Website builder`. Role: `Landing pages and site updates`. Tint: `#e5e9f0`.
- Machine: one boat.dev machine, size `small`, always on.
- Model: GPT-6 Astra.

| Skill | Tool | Gate |
| --- | --- | --- |
| `site.build` | The model | Auto |
| `site.critique` | impeccable | Auto |
| `site.preview` | Preview host | Auto |
| `site.publish` | Cloudflare Pages at `<slug>.tensquads.co` | Ask first |

What to build:

- Restaurant: a menu page with top design and UX. Add a cultural touch when the restaurant is cultural: type, colours and layout follow the cuisine, with no cliché.
- Grocer: a one-page list of the items, with prices and sections.

Rules:

- The user's list is the only source. Never invent a dish, an item or a price.
- A missing price reads `[PRICE]`.
- After `site.critique`, apply the fixes and run `npx impeccable detect`.
- The tensquads design tokens do not apply to a customer page. They apply to the product screens.
- The site preview reaches the user as a link in the chat only (decision 26).

The master checks the page:

- The preview URL returns 200.
- The page has the business name.
- Every item from the user's list has a name and a price, and no item was invented.
- A restaurant page shows the cuisine from step 1.
- No link is broken.
- Keyboard and contrast checks pass.
- `npx impeccable detect` reports no P0 or P1 finding.
- At 390 px there is no horizontal scroll.

After publishing, `https://<slug>.tensquads.co` must return 200 and the same content as the preview.

## What stays in `moeghashim/tensquads`

- The master: `brief.write`, `task.route`, `approval.ask`, `check.run`.
- Every check. The rule "the agent never grades its own work" depends on this.
- The Durable Object, the queues, the Neon record and the `change.detected` endpoint.
- The proof-of-concept seed account, with its two squads, their skills and their events.
- The two images on the Agent images screen, version 0.1.0, Beta.
- All ten product screens. The proof of concept changes data, not screens.
- The end-to-end run and the "Done when" list.
- The Agent loop state model. A change to the loop in the kit must keep this model true.

## Done when

**Each agent repository:**

- [ ] `make verify` returns 0 on the branch and in CI.
- [ ] Each skill passes its gate tests against the fake master.
- [ ] A test proves that an Ask first skill does not run before an Approval.
- [ ] A test proves that the agent holds no task state between loops.
- [ ] The image starts on a real boat.dev machine with `noEnv: true`, and its heartbeat reaches the Durable Object.
- [ ] A scan finds no key in git, in logs or in the image.

**The whole proof of concept:**

- [ ] Every box under "Done when" in `tasks/05-proof-of-concept.md` is ticked with evidence, in the main repository.

## Gaps in the source documents

The handoff needs these. They are not in the repository on 31 October 2026.

1. **Decision 31.** `tasks/05-proof-of-concept.md` cites it, and the table in `docs/PLAN.md` stops at 28. Task 05 gives the only text: ClickHouse comes after phase 5. Moe dropped decisions 29 and 30 on 1 November 2026. Ignore every reference to them.
2. **The thirteen events.** Task 05 requires them. `docs/PLAN.md:337` has only a placeholder for the diagram. Task 05 lists eight loop steps, not thirteen events.
3. **The context.dev links.** Task 05 says the plan links them. The plan does not mention context.dev.
4. **The screen-by-screen table.** Task 05 says it follows the "Proof of concept" section. The plan has no such table.
5. **Conflicts between the plan and task 05.** The plan lists fewer skills than task 05, and it does not name GPT-6 Astra. Recommended: task 05 wins.

Do not guess at these. Ask Moe.

## Prompts to paste

Use one new thread for each repository. Replace `<path>` with the path to this file on `main`.

**Kit thread:**

> You are the builder for `tensquads-agent-kit`. Read `AGENTS.md` in `moeghashim/tensquads`, then `<path>`, in full. Check "When to start". If an item is false, stop and tell me which one. Create the repository only after you confirm its name and visibility with me. Build "The kit". Release version 0.1.0 with a tag. Do not write master logic or a check.

**Researcher thread:**

> You are the builder for `tensquads-market-researcher`. Read `AGENTS.md` in `moeghashim/tensquads`, then `<path>`, in full. Check "When to start". Confirm that the kit release exists. Create the repository only after you confirm its name and visibility with me. Build the "Market researcher" section on the kit. Stop when a step needs my account, my card or a key, and give me the exact command. Do not change the main repository.

**Builder thread:**

> You are the builder for `tensquads-website-builder`. Read `AGENTS.md` in `moeghashim/tensquads`, then `<path>`, in full. Check "When to start". Confirm that the kit release exists. Create the repository only after you confirm its name and visibility with me. Build the "Website builder" section on the kit. Stop when a step needs my account, my card or a key, and give me the exact command. Do not change the main repository.

**Main thread:**

> You are the builder for the proof of concept in `moeghashim/tensquads`. Read `AGENTS.md`, then `<path>`, then `tasks/05-proof-of-concept.md`, in full. Build "What stays in `moeghashim/tensquads`". Pin the kit and both released images. Run the full loop on real boat.dev machines. Report each box under "Done when" with evidence.
