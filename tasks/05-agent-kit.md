# Task 05 — Agent kit

Repository: `moeghashim/tensquads-agent-kit` (private). Branch: `05-agent-kit`. One pull request in that repository. This file stays in `moeghashim/tensquads`.

Start only when tasks 00 to 04 are merged. The boat.dev adapter must make a template and start a machine from a template. The Cloudflare bus adapter must accept `/machine/send` and `/machine/take`. Read `AGENTS.md` in `moeghashim/tensquads` first and send the receipt. Decision 35 names this repository. Do not ask Moe to confirm the name or the visibility.

## Goal

Release version 0.1.0 of the shared kit. The kit holds the bus contract, the agent loop, the heartbeat client, and a fake master for tests. It holds no master logic. It holds no check that decides a pass.

## Read

- `docs/PLAN.md`: Decisions 16 to 20, 32, and 35. Also "The agent loop and verified outcomes" and "Machine specification".
- `docs/handoffs/poc-squad-repos.md`: "The kit", "Rules for every repository", and "Rules for every agent".
- `docs/adrs/0002-poc-repositories.md`
- `design/Main.dc.html`: the bus event fields in the script. The names are `id`, `time`, `from`, `to`, `kind`, `skill`, `text`, `payload`, `writes`, and `trace`.
- `docs/BRIEF.md`: Data model, the Bus event row.

## Facts from task 04

Task 04 recorded these facts on 4 November 2026. Use them. Do not follow a plan sentence that disagrees.

- Boat reserves the name `AGENT_ID`. The error is `invalid_env`. The machine gets `ACCOUNT_ID`, `TENSQUADS_AGENT_ID`, and `IMAGE_TAG`.
- A machine does not pull a Cloudflare queue. It sends with `POST /machine/send`. It takes a task with `POST /machine/take`.
- Both routes require a signed token for one account and one agent.
- How the machine gets that token is open question 1.
- The plan table "Machine specification" still names `AGENT_ID`. Do not use that name.
- "How agents send messages" still says a machine pulls a queue over HTTP. Do not follow that sentence for a machine. Queues stay inside the Worker. The Worker consumer delivers work to the Durable Object.

## Build these and nothing else

- The bus event type, with the field names above.
- The Task payload and the Result payload for both agents.
- The types for the research report, the brief, the menu or item list, and the page result.
- The agent loop, with gates Auto, Ask first, and Under limit.
- The HTTP client for `/machine/send` and `/machine/take`.
- The heartbeat client.
- A fake master for tests in the agent repositories.

The package name is `@tensquads/agent-kit` (decision 12).

## Steps, in order

1. Create the private repository. Copy the PI-Starter checks into it. Those checks are strict TypeScript, Biome, husky, `progress.md`, `no-mistakes`, DCO, and `make verify`.
2. Add the bus event type.
3. Add the Task payload and the Result payload for both agents.
4. Add the report, brief, menu or item list, and page-result types.
5. Add the agent loop. The loop takes a task. It plans. It runs one skill at a time through its gate. It collects evidence. It sends one Result. Then it returns to the start (decision 20). The states Waiting, Blocked, and Dropped exist (decision 32). The loop keeps no task state of its own.
6. Add the HTTP client. It calls `POST /machine/send` and `POST /machine/take`. It sends the signed token. It does not pull a Cloudflare queue.
7. Add the heartbeat client. It sends one message a minute (decision 17). The path is open question 2. Unit tests may call a fake route until Moe answers.
8. Add the fake master. It accepts a Result. It does not grade the Result.
9. Tag the release `0.1.0`. Consumers pin the commit of that tag. They do not pin the tag name. The dependency is an npm git dependency on that commit.
10. A later contract change is a new version. Update each consumer in its own pull request.

## Done when

- [ ] `make verify` returns 0 on the branch and in CI
- [ ] The package exports the event type, the payloads, the loop, the HTTP client, the heartbeat client, and the fake master
- [ ] A test proves that an Ask first skill does not run before an Approval
- [ ] A test proves that the loop keeps no task state after it sends the Result
- [ ] The HTTP client has no queue-pull call
- [ ] The release tag is `0.1.0`, and consumers can pin that commit
- [ ] A scan finds no key in git

## Do not

- Do not write master logic.
- Do not write a check that decides a pass.
- Do not add a Cloudflare queue client.
- Do not set `AGENT_ID` on a machine.
- Do not put a key in the image, in a prompt, in a log, or in git.
- Do not publish the package to a registry.

## Open questions for Moe

Do not guess. Stop the step that needs the answer. The other steps may proceed.

1. **How a machine gets the signed token.** Phase 4 builds the two routes. Tests call them. Phase 4 puts no token on a machine. Phase 5 must say how a machine gets one. *Recommended:* The Worker signs a token for one account and one agent. The boat.dev key proxy holds that token. The machine reads it from the proxy when it calls the Worker. The token is not an environment variable. The image does not contain the token. Task 04 names the Worker secret `MACHINE_TOKEN_KEY`.
2. **The heartbeat path.** The plan says one message a minute to the account Durable Object. It names no URL. A machine calls the Worker, not the Durable Object. *Recommended:* `POST /machine/heartbeat` with the same token. The body names the account and `TENSQUADS_AGENT_ID`. The main task owns the Worker route. This client calls that route.
