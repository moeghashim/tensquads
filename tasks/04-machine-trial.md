# Task 04 — Machine trial (phase 4)

Branch: `04-machine-trial`. One pull request. One builder agent. Starts only when tasks 00 to 03 are merged. Read `AGENTS.md` first and send the receipt.

## Goal

Two real adapters exist behind one feature flag. The boat.dev adapter for `MachineProvider` starts a machine with `noEnv: true` and tags, stops it, starts it again, reads its metrics into the agent dashboard fields, registers one secret name in the key proxy, and removes the machine. It also makes a template and starts a machine from a template. The Cloudflare bus adapter for `EventBus` has one queue, one Durable Object class, and write-through to Neon. The test adapters stay the default. There is no AI model, no agent runtime and no external service. The task is complete when the adapter tests pass against a real boat machine in a manual CI job, and screens 1 to 10 have no change.

## Read

- `docs/PLAN.md`: Decisions 16 to 20, Architecture (with "How agents send messages", "Where the master runs", "Where the data lives", "How updates reach running agents"), Service setup (with "Set up boat.dev by hand" and "Machine specification"), State models (Agent on/off, Bus event and shared state, Image release), Phases (phase 4), Risks and open items
- `docs/BRIEF.md`: Data model
- `docs/handoffs/poc-squad-repos.md`: "When to start". It names what phase 5 expects from this task
- `packages/kernel/src/ports.ts`, `packages/adapters/src/test-machine.ts`, `packages/adapters/src/memory-bus.ts`, `packages/adapters/src/neon/schema.ts`
- `design/Main.dc.html`: the agent mock data at lines 966 to 987 and the on/off logic at line 1267, for the format of `host`, `region`, `size`, `cpu` and `uptime`
- The boat docs from `https://docs.boat.dev/llms.txt`: TypeScript SDK, Create sandbox, Get sandbox, List sandbox processes, Stop a sandbox, Resume fork and restore, Delete a sandbox, Saved snapshots, Templates and sizing, Access and credentials, AI credentials, Scopes, Limits and errors, Free trial, Firewall rules, Compliance and uptime
- The Cloudflare docs for Queues (consumers, pull consumers, dead letter queues, batching and retries) and for Durable Objects (SQLite storage, alarms, WebSocket hibernation)

## Moe's answers, 4 November 2026

The builder does no step 1 work. Items 1, 2, 3 and 21 stay open with Moe.

1. **Paid plan.** Open with Moe.
2. **API keys.** Open with Moe.
3. **Credential profile.** Open with Moe.
4. **noEnv and the environment.** Recommended answer accepted by the orchestrator under Moe's delegation, 4 November 2026. Send `noEnv: true` and `environment: "tensquads-agents"` together. If that pair is refused, send `noEnv: true` alone.
5. **Async account ports.** Recommended answer accepted by the orchestrator under Moe's delegation, 4 November 2026. New methods are async and take an `AccountScope`. The old sync ports stay, so the current callers do not move in this pull request.
6. **Template contents.** Recommended answer accepted by the orchestrator under Moe's delegation, 4 November 2026. `makeTemplate` starts a machine, writes the image file, saves `tensquads-<imageId>-<version>`, waits until ready, and removes the source.
7. **Dashboard fields.** Recommended answer accepted by the orchestrator under Moe's delegation, 4 November 2026. Host is `vps-<agentId>-01`, region is `EU`, size is `<vcpu> vCPU · <memoryGB> GB`, CPU is the rounded process share, and uptime is `N days` or "Just started".
8. **Queue consumer.** Recommended answer accepted by the orchestrator under Moe's delegation, 4 November 2026. One queue, one Worker consumer, and the Durable Object holds each agent's tasks. Machines use Worker endpoints.
9. **Dead letter queue.** Recommended answer accepted by the orchestrator under Moe's delegation, 4 November 2026. `tensquads-bus` and `tensquads-bus-dlq` count as one queue. The same Worker consumes both. This pull request does not create them.
10. **Machine token.** Recommended answer accepted by the orchestrator under Moe's delegation, 4 November 2026. Send and take are guarded by a signed token for one account and one agent. Tests call them. No token is placed on a machine.
11. **Neon failure.** Recommended answer accepted by the orchestrator under Moe's delegation, 4 November 2026. The Durable Object saves to its storage first, keeps unwritten rows, and retries with an alarm.
12. **Write-through scope.** Recommended answer accepted by the orchestrator under Moe's delegation, 4 November 2026. Phase 4 writes `bus_events` and the shared state at run time. The seed stays a setup writer.
13. **Browser push.** Recommended answer accepted by the orchestrator under Moe's delegation, 4 November 2026. The Durable Object accepts a WebSocket and pushes each new event. The Traffic screen does not connect.
14. **Roll out.** Recommended answer accepted by the orchestrator under Moe's delegation, 4 November 2026. Roll out and View changelog still do nothing. There is no Rollout object.
15. **Adapter flag.** Recommended answer accepted by the orchestrator under Moe's delegation, 4 November 2026. `ADAPTERS` is `test` or `real`, the default is `test`, and both adapters switch together. Production stays on `test`.
16. **Manual job shape.** Recommended answer accepted by the orchestrator under Moe's delegation, 4 November 2026. A `machine-trial` input on `ci.yml` runs only when that input is true, and it is not a required check. This pull request does not add the job.
17. **Cleanup of a failed run.** Recommended answer accepted by the orchestrator under Moe's delegation, 4 November 2026. The live job would label what it makes, time out at 20 minutes, and always remove that label. This pull request does not add the job.
18. **Port errors.** Recommended answer accepted by the orchestrator under Moe's delegation, 4 November 2026. One typed port error for each boat error. No automatic retry except the `Idempotency-Key` on start. No screen shows the errors.
19. **Heartbeat.** Recommended answer accepted by the orchestrator under Moe's delegation, 4 November 2026. The heartbeat, systemd service, and "Restarting" stay out of this task.
20. **Find a machine.** Recommended answer accepted by the orchestrator under Moe's delegation, 4 November 2026. No new table. Find the machine with the label filter. The SDK method accepts `label`.
21. **Host failure and a second region.** Open with Moe.
22. **Bus proof.** Recommended answer accepted by the orchestrator under Moe's delegation, 4 November 2026. The rules run on Miniflare in `npm test`. The real deploy half waits for the manual job.

## Steps, in order

Step 1 is for Moe. Steps 2 onward wait for step 1 and for Moe's answers to "Stop and ask". Record each answer in this file under a heading "Moe's answers", as task 01 does, in the first commit.

1. **Moe's setup. A builder must not do any of this.**
   - Answer the items under "Stop and ask".
   - Make the boat API key or keys that item 2 settles. A boat API key for the Worker and CI does not exist yet. `boat api-key create` prints the secret one time.
   - Add each key to `.env`, to Worker secrets and to GitHub Actions secrets. Do not paste a key in chat.
   - Pay the first boat plan if item 1 says so.
   - Make the credential profile that item 3 settles.
2. Add this task file in the first commit. Pin `@boatdev/sdk` to one exact version. Version 1.13.0 has no runtime dependency and no Node built-in import in its ESM build. Add it to `packages/adapters`. Run `scripts/test/worker-bundle.test.mjs`. If the guard fails, or if the Worker bundle passes the size limit, stop and ask.
3. Change the ports in `packages/kernel/src/ports.ts` as item 5 settles. Change `test-machine` and `memory-bus` to match them. Off still means CPU 0% and uptime "Paused". Update every caller. No screen may show a change. Run `make verify`. It must return 0 before the next step. Commit this step alone.
4. Add the feature flag as item 15 settles. One place in the Worker picks the adapters. The default picks `test-machine` and `memory-bus`. A test proves the default. Another test proves that a missing flag picks the test adapters.
5. Build `packages/adapters/src/boat-machine.ts`. Load the `boundary-discipline` and `make-operations-idempotent` skills first. The boat words stay in this file. No sandbox, snapshot or credential word crosses the port. Write the tests first, with the `tdd` skill, against a fake boat HTTP server. Build these methods:
   - **Start.** Send `type: "small"`, `noEnv: true`, `ttlSeconds: null`, and `env` with `ACCOUNT_ID`, `AGENT_ID` and `IMAGE_TAG` only. Send the environment as item 4 settles. Send `labels` for the account, the agent and the image. The plan says "tags". Boat calls them labels. Send an `Idempotency-Key`. A repeat start for the same agent must not make a second machine. Then wait for ready with `waitUntilReady`.
   - **Stop.** Call stop. A stop returns at `stopping`, so poll until the state is `stopped`. A stopped machine shows CPU 0% and uptime "Paused" with no call to boat metrics.
   - **Start again.** Call resume. Then wait for ready. The disk comes back. Memory, processes and the IP address do not.
   - **Read fields.** Map the fields as item 7 settles. `size` is `<vcpu> vCPU · <memoryGB> GB`.
   - **Register a secret name.** Set one custom API on the credential profile, as items 2 and 3 settle. Read the names back. The API never returns a value.
   - **Remove.** Call delete with `xAsciiConfirmDelete` equal to the machine id. Boat answers 202. Poll the operation until it is `completed`.
   - **Make a template and start from a template.** The two methods exist on the port and in the test adapter. They are not built for boat. Build them as item 6 settles, with a saved snapshot behind them. A save returns `saving`, so poll until `ready`, and fail on `failed`.
   - **Failures.** Handle every boat error as item 18 settles. Map it to a port error with no boat word. Print no key and no secret value. Redact the error body.
6. Prove the Agent on/off rules through the boat adapter with the fake server: Off means CPU 0% and uptime "Paused", and a change of autonomy does not change on/off. Run `npm run statechart:check`. Add a `# model:` comment for `boat-machine.ts` to the Agent on/off model.
7. Move the Worker entry to a custom server entry. `main` in `apps/web/wrangler.jsonc` is now the TanStack entry, and it exports no Durable Object class and no `queue` handler. The entry keeps the TanStack fetch handler. It adds the class and the handler. Run the e2e tests. Then add these to the same `wrangler.jsonc`: one Durable Object class with a SQLite migration, the queue as items 8 and 9 settle, and the producer binding. Keep one Worker (decision 16).
8. Build the Cloudflare bus adapter in `packages/adapters/src/cloudflare-bus/`. Load the `separate-before-serializing-shared-state` and `make-operations-idempotent` skills first. Write the tests first.
   - One Durable Object per account, named by `account_id`.
   - The Durable Object receives each event. It drops an id it has seen. It gives the event the next sequence number. It applies `writes` to the shared state with the values in `set`. It does these in one storage transaction.
   - It writes through to Neon as items 11 and 12 settle. It uses the existing `bus_events` `seq` column and the existing shared state table. If the schema needs a change, add a Drizzle migration.
   - The Durable Object is the only writer to the bus tables at run time. A test or a lint check proves that no other run-time module writes to them.
   - `events()` reads from Neon and sorts by sequence number, not by time.
   - `nextEvent()` takes the same path as any other event, so Live and Simulate do the same step.
   - A message that fails all retries makes one Escalation event to the master, as item 9 settles.
   - Build the browser push as item 13 settles.
   - Build the machine endpoints as items 8 and 10 settle.
9. Run the tests for step 8 in `npm test`, on workerd through Miniflare, against the database behind `TEST_DATABASE_URL`. Test each rule: a seen id changes nothing, the sequence has no gap and no repeat under parallel events from one account, two accounts do not share a sequence, all `writes` apply in one step, a dead letter makes exactly one Escalation, and a repeat delivery makes no second Neon row. Run `npm run statechart:check`. The Bus event and shared state model must report no broken rule. Add a `# model:` comment for the Durable Object file.
10. Write the live tests in `packages/adapters/test/live/`. They run only in the manual job, never in `make verify`. One test runs the full path for one machine:
    1. Make a template.
    2. Start from the template with `noEnv: true`, labels and `ttlSeconds: null`.
    3. Read `host`, `region`, `size`, `cpu`, `uptime`, `egress` and `secrets`.
    4. Run `env` on the machine. Assert that `ACCOUNT_ID`, `AGENT_ID` and `IMAGE_TAG` have the sent values, that `BOAT_ID` and `ASCII_TOKEN` are the only other boat variables, and that the secret name and the boat API key are not there.
    5. Register one secret name. Assert that the name reads back, and that a new read of `env` on the machine does not have it.
    6. Stop. Assert CPU 0% and uptime "Paused".
    7. Start again. Assert the state is on, and that the file from the template is still there.
    8. Remove the machine. Assert that boat reports it gone.
    9. Remove the template and the secret name.
    Add the bus proof as item 22 settles.
11. Add the manual CI job as items 16 and 17 settle. It never runs on a pull request or a push. It is not part of "Required checks". It prints no secret. It removes everything that it made, also after a failure.
12. Prove that the screens have no change. With the flag at its default, `make verify` returns 0, and the screenshot baselines and the files under `e2e/` have no diff from `main`. Run `node scripts/design-inventory.mjs` on the built screens. Each inventory matches `main`. List in the pull request any file under `apps/web/src/routes/` that this task changes, with the reason.
13. Report each difference between the plan and boat in the pull request. Do not edit the plan. Known differences:
    - The plan says "tags". Boat says labels.
    - The plan says "key proxy". Boat says AI credentials proxy, with custom APIs on a credential profile.
    - The plan says boat publishes no uptime promise and no second region. The docs give a measured uptime of 99.95%, and machines in Germany, Finland and France with no choice of region.
    - The two template methods were already on the port. This task builds them for boat.
14. Run the manual job on the branch. Attach the run link to the pull request. Check that `boat list` and `boat snapshots` show nothing from the run. Append one line to `progress.md` with the commit script.

## Done when

- [ ] The manual job passes on the branch against a real boat machine. The run link is in the pull request
- [ ] The live test proves each of these on a real machine: start with `noEnv: true` and labels, stop, start again, read of the dashboard fields, one secret name registered, make a template, start from a template, remove
- [ ] The live test proves that the machine holds `ACCOUNT_ID`, `AGENT_ID` and `IMAGE_TAG`, and no secret value
- [ ] A stopped machine shows CPU 0% and uptime "Paused"
- [ ] The manual job leaves no machine, no template and no secret name behind. Evidence: the output of the cleanup check
- [ ] The Worker tests prove the three bus rules: a seen id is dropped, the traffic list sorts by sequence number, and a message that fails all retries makes one Escalation event
- [ ] A test proves that the Durable Object is the only run-time writer to the bus tables
- [ ] The Agent on/off, Bus event and shared state, and Image release models report no broken rule
- [ ] A test proves that the test adapters are the default, and that a missing flag picks them
- [ ] No boat word crosses `MachineProvider`
- [ ] No secret value appears in git, in CI output or on a machine
- [ ] The Worker bundle guard passes with the boat and Cloudflare adapters in the bundle
- [ ] Screens 1 to 10 have no change: step 12 evidence for all ten
- [ ] The seed tests still pass with the nine numbers
- [ ] `node scripts/design-check.mjs` returns 0
- [ ] `make verify` returns 0 on the branch and in CI

## Stop and ask

Each item is a gap in the plan, the docs or the code. Moe answers each one before step 2, unless the item says otherwise. Each item has one recommended answer. The builder does not pick an answer. Stop and ask, in the same format, for any gap that this list does not cover.

**Items that block the proof**

1. **The boat account is on the free trial.** `boat status` on 1 November 2026 shows plan "Trial". The trial refuses `ttlSeconds: null` with `400 trial_auto_stop_required`. The trial also saves no new saved snapshot, so `makeTemplate` cannot pass against a real machine. *Recommended:* Moe pays the first plan ($20 a month) before step 11. This is Moe's card and charges at once.
2. **The boat API key needs more scope than one safe key gives.** The profile and custom API calls need `account.admin`, which also covers billing and webhooks. The `ci` preset does not have it. *Recommended:* two keys, each with a 90-day life. `BOAT_API_KEY` has only the sandbox, command and snapshot actions. `BOAT_ADMIN_API_KEY` has `account.admin` and only the secret registration uses it. A key limited with `--env` may refuse a `noEnv` machine, so do not limit either key by environment.
3. **The key proxy has no "name only" call.** A custom API needs a name, a value and an HTTPS base URL. It sits on a credential profile, not on a machine. The default profile holds Moe's Claude and ChatGPT sign-ins. The plan also says "one set per machine", but a profile reaches a machine only through an environment. *Recommended:* make one new profile `tensquads-agents`. Do not touch `default`. Register the name `TENSQUADS_TRIAL_KEY` with a random value that the test makes, and the base URL `https://example.com`. The proxy stays off. `secrets()` returns the custom API names on the profile. Phase 5 decides "one set per machine".
4. **`noEnv` and the `tensquads-agents` environment overlap.** The docs say a `noEnv` machine attaches to no environment, and that the flag stays forever. Placeholders reach a machine through `proxyAiCredentials` on an environment. The docs do not say that a `noEnv` machine gets them, so `noEnv: true` can block the key proxy in phase 5. *Recommended:* send `noEnv: true` and `environment: "tensquads-agents"` together. If boat refuses the pair, send `noEnv: true` alone, as the plan's table says. Report what `sandbox.environment` returns. Moe asks boat this question before phase 5.
5. **The ports cannot carry a real adapter.** Every `MachineProvider` and `EventBus` method is synchronous, and a boat call is HTTP. The ports have no start, stop, resume, remove, secret registration or publish method. No method takes an `AccountScope`, but the agents table key is `(account_id, id)`, so an agent id alone can name the wrong account's machine. `startFromTemplate` has no account id for `ACCOUNT_ID`. `makeTemplate` has no version. *Recommended:* make all methods async. Make each method take an `AccountScope`. Add `start`, `stop`, `resume`, `remove`, `registerSecret`, `removeTemplate` and `publish`. Add `store` to `EventBus`. The test adapters answer all of them. This changes a port, so the pull request reports it.
6. **A template has nothing to hold in this phase.** No image and no runtime exist. A saved snapshot needs a source machine, and the port names none. *Recommended:* `makeTemplate` starts a `noEnv` machine, writes one file `/home/user/tensquads-image` with the image id and version, saves it as `tensquads-<imageId>-<version>`, waits for `ready`, and removes the source machine. The saved snapshot name is the template id. `IMAGE_TAG` is the design's string `registry.agents.co/<id>:<version>`.
7. **Five dashboard fields have no direct boat source.** The API has no region, CPU, uptime or egress field. *Recommended:*
   - `host`: the machine name, set at start to `vps-<agentId>-01`, the design's form.
   - `region`: the fixed value `EU`. Boat has no region field and no choice of region.
   - `cpu`: the sum of `cpuPercent` from the process list, divided by `vcpu`, rounded, with `%`. OpenTelemetry has the true metric but needs a collector, which is an external service.
   - `uptime`: the time since `hydratedAt`, or since `createdAt` when `hydratedAt` is null, as `N days`. Under one day, show "Just started", the design's text at `Main.dc.html:1267`.
   - `egress`: the hosts of the base URLs of the custom APIs on the profile. This list limits nothing. Boat has no network rule API, and outbound traffic is open. The pull request says so, and phase 5 decides whether to block it.
8. **One queue cannot do what the plan says.** The plan puts a Queue consumer in the Worker, and also has machines pull from a queue over HTTP. Cloudflare permits one kind of consumer on a queue. A pull also needs a Cloudflare API token on the machine, which breaks "Keys: never on a machine". Pull consumers compete, so one agent can take the task of another agent or another account. *Recommended:* one queue with a Worker consumer that passes each event to the Durable Object. The Durable Object holds the tasks for each agent. A machine sends to, and takes tasks from, a Worker endpoint, with no Cloudflare token. This changes one sentence of "How agents send messages" and the line in the handoff, so Moe must agree. Tasks then wait in the Durable Object, not in a queue, when boat is down.
9. **A dead letter queue is a second queue.** Phase 4 says "one queue". The architecture says a dead-letter queue is built in, and the rule says a failed message becomes an Escalation. With no dead letter queue, a message that fails all retries is lost. *Recommended:* one work queue `tensquads-bus` and its dead letter queue `tensquads-bus-dlq`, counted as one queue. The same Worker consumes both. Make them with `wrangler queues create`, with the Cloudflare token in `.env`. If that token has no Queues permission, stop and ask.
10. **A machine has no way to prove who it is.** The plan gives a machine three values, and none is a credential. The handoff expects a machine to reach the Worker endpoint. Phase 4 has no agent runtime to use the endpoint. *Recommended:* build the send and take endpoints, each guarded by a signed token for one account and one agent, with the signing key in a Worker secret. Tests call them from the CI runner. No token goes on a machine in this phase. Phase 5 decides how a machine gets one, through the key proxy.

**Items that shape the build**

11. **The plan does not say what happens when Neon fails.** Screens read from Neon, and the Durable Object is ahead of it. *Recommended:* the Durable Object saves to its own storage first, keeps a list of rows not yet in Neon, and retries with an alarm. No event is lost. A screen shows the event when the row arrives. No new screen state.
12. **The write-through has no stated limit.** "Where the data lives" says the Durable Object also writes the agent counts. Phase 4 says only "write-through to Neon". The seed also writes the bus tables. *Recommended:* phase 4 writes `bus_events` and the shared state only. Agent counts move in phase 5 with the checks. The seed stays as a setup writer, so "only writer" means at run time.
13. **The browser push needs screen code.** The plan says the Durable Object pushes each event to the open browser. Screens must have no change. *Recommended:* the Durable Object accepts a WebSocket and pushes each event, proved by a Worker test. The Traffic screen does not connect to it in this phase. Phase 5 does.
14. **The plan contradicts itself on "Roll out".** One line says "Roll out" and "View changelog" leave the "do nothing" list in phase 4, and adds a Rollout object. Phase 4 says screens have no change, and the Image release model says "Roll out" does nothing in version 1. *Recommended:* both controls still do nothing. No Rollout object. A later task builds them.
15. **The plan names no flag.** *Recommended:* one Worker variable `ADAPTERS` in `wrangler.jsonc`, with the values `test` and `real`, and the default `test`. It sets both adapters together. It is not per account. Production stays on `test`.
16. **A new workflow file cannot run from a branch.** GitHub lists a manual workflow only when its file is on the default branch, and this task has one branch and one pull request. `ci.yml` is already on `main` and has `workflow_dispatch`. *Recommended:* add a `machine-trial` job to `ci.yml`, with a boolean input `machine_trial`. It runs only when that input is true. Run it with `gh workflow run ci.yml --ref 04-machine-trial -f machine_trial=true`. It is not in the `needs` of "Required checks".
17. **A failed run can leave a machine that bills with no auto-stop.** `ttlSeconds: null` has no limit. *Recommended:* the job labels all it makes with the run id, has a 20-minute timeout, and has an `if: always()` step that removes all with that label. The job fails if anything is left. Expected cost is under $1 a run.
18. **The design shows no boat failure.** Boat can answer `429 rate_limited`, `429 limit_reached`, `402 billing_required`, `503 out_of_capacity` and `409 snapshot_data_expired` (a machine stopped for 14 days). A stop can also be refused. *Recommended:* the adapter raises one typed port error for each, with no automatic retry except the `Idempotency-Key` on start. No screen shows them, because the flag stays off. Phase 5 decides the recovery.
19. **No task owns the heartbeat.** The plan's machine specification has a systemd service, one heartbeat a minute, a restart after three misses, and the dashboard text "Restarting". Phase 4 does not list them and has no runtime. The handoff puts the machine side in the kit. *Recommended:* all of it stays out of this task. The Durable Object side goes in the phase 5 main-repository task.
20. **The machine id needs a home.** The plan says the backend maps a machine to its agent. Boat's own advice is to store the id. *Recommended:* no new table. Find the machine with a label filter on `GET /sandboxes`. The filter is in the API docs and not in the SDK's documented method list, so check the SDK first. If it is missing, use a plain `fetch` for this one call.
21. **Boat's answers on host failure and a second region are still open with Moe.** This is not a blocker. The plan asks for the question before phase 4, and that is done. It says "before we depend on them", and only phase 5 depends on them. *Recommended:* start phase 4 now. Close both answers before phase 5.
22. **The plan does not say what proves the bus for real.** Miniflare is not a real queue. A preview version does not consume a queue. *Recommended:* the rules run on Miniflare in `npm test`. The manual job also deploys a Worker environment `trial` with its own queue pair and `ADAPTERS=real`, and sends one event from the CI runner through the real queue and the real Durable Object to `TEST_DATABASE_URL`. The job removes this environment at the end.

## Do not

- Do not start, stop or change a real boat machine outside the manual job.
- Do not add an AI model, an agent runtime, a skill, an image or an external service.
- Do not turn on the boat AI proxy. It is off and this phase does not need it. It costs $1 a day from the wallet.
- Do not change the default adapters. Do not set the flag to `real` in production.
- Do not change any of the ten screens, any text, any token or any file under `design/`.
- Do not build the heartbeat, the systemd service, the rollout, the "Updating" or "Restarting" dashboard text, or the proof of concept.
- Do not put a boat key, a Cloudflare token or any other key on a machine, in a prompt, in git or in CI output.
- Do not touch the `default` credential profile.
- Do not import a boat type or a Cloudflare type outside `packages/adapters` and the Worker entry.
- Do not add the metrics table, and do not replace the stored `success` value.
- Do not edit `docs/PLAN.md` or `docs/BRIEF.md`. Report each difference in the pull request.
