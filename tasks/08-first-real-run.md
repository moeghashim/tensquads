# Task 08: The first real run

Branch for this file: `08-first-real-run-plan`. Each work package below has its own branch and its own pull request. Read `AGENTS.md` first. Read `tasks/05-proof-of-concept.md`, `tasks/05-market-researcher.md` and `tasks/05-website-builder.md`.

## Goal

One real loop passes the done list in `tasks/05-proof-of-concept.md` on real boat.dev machines. PR #34 (merged) built the master's checks and approvals. An audit on 6 November 2026 found 23 gaps between the four repositories. This file splits them into seven work packages and fixes the contracts between them.

## Decisions for this task

The orchestrator made these decisions on 6 November 2026. Moe delegated these choices. They do not change decisions 1 to 35.

1. **Publishing goes through the Worker.** A machine never holds the Cloudflare Pages token. The website builder sends the page to the real Worker. The Worker deploys it with the `CLOUDFLARE_PAGES_API_TOKEN` secret.
2. **The preview is served by the Worker.** The Worker stores the preview bytes exactly and serves them. The master's page check compares those bytes with the kit's `renderPage` output.
3. **The master chooses the slug.** The master puts `slug` in the build Task and in the publish Task. The website builder uses that value. It never derives its own slug. For this task the slug is the account ID, the same rule the master's `accountSite` check uses.
4. **Machine model calls go through boat's AI proxy.** A machine never holds an OpenAI key. Each agent reads its model name from configuration, not from a literal in code. The three model names are configuration values. Moe supplies the exact names. Until then, use the configuration key and a clear error when the value is empty.
5. **Scrapling runs on the researcher machine.** The researcher snapshot installs Scrapling and runs it as a systemd service with a small HTTP wrapper on `127.0.0.1:7423`. The wrapper matches the contract in `src/scrapling-client.ts`.
6. **One Result per skill.** The researcher sends one Result for each of `web.search`, `maps.competitors`, `scrapling.read_page`, `market.analyse` and `report.write`, in that order. That makes events 2 to 6 of the thirteen real. The kit allows more than one Result per Task.
7. **The real run uses its own database.** The real Worker reads and writes a separate Neon branch. The design seed and its nine numbers stay on the existing database. A bootstrap writes one real-run account only.
8. **The real Worker is `tensquads-real`.** Its origin is `https://tensquads-real.moe-678.workers.dev`.

## Contracts between packages

### Kit contract (package K, consumed by A1, B, C)

- A publish Task payload holds: `approval`, `mandate`, `slug`, `html`, `previewUrl`, and the business fields the builder needs to rebuild the same page. `parseWebsiteTask` accepts a build Task and a publish Task. A test proves the master's publish Task parses.
- A build Task payload holds `slug`.
- A Task can produce more than one Result. Each Result names its skill. The kit's loop sends them in order.
- A Result can carry `writes` and `set`. The bus applies `set`, and `writes` names the state keys.
- Release the kit as `v0.3.0`. Every consumer pins that commit.

### Worker routes (package A4, consumed by C)

Both routes use the same machine-token check as `/machine/send`.

- `POST /machine/preview` with body `{ accountId, agentId, taskId, html }`. The Worker stores the bytes exactly. It answers `{ previewUrl }`. `GET /preview/<accountId>/<taskId>` returns those bytes with `content-type: text/html; charset=utf-8`.
- `POST /machine/publish` with body `{ accountId, agentId, taskId, slug, html, mandate }`. The Worker checks that the mandate covers this publish (kit `approvalCovers`) and that `slug` is the account's slug. It deploys the page to the Pages project `ts-<slug>`. It attaches the custom domain `<slug>.10squads.com` and its DNS record in the `10squads.com` zone. It answers `{ liveUrl }` when `https://<slug>.10squads.com` returns 200.

### Webhook (A1 and B)

- The context.dev monitor calls `https://tensquads-real.moe-678.workers.dev/change.detected`. The researcher reads that URL from its release configuration.
- context.dev creates one signing secret for each monitor. The create response returns that secret as `webhook.secret`.
- The account's researcher calls `POST /machine/monitor`. The body is `{ accountId, agentId, monitorId, secret }`. The call uses the same machine bearer token as `/machine/send`.
- The Worker loads the account's agents from the database. Only the researcher agent may store a secret. The Worker stores `account_id`, `monitor_id`, and `secret`. `monitor_id` is unique.
- A second call for the same monitor and the same account replaces the secret. The same monitor id from another account is rejected. The answer is `{ ok: true }` only.
- `POST /change.detected` reads the monitor id from the raw body. It loads the stored secret for that id. It checks `x-context-signature` with the `t=` and `v1=` HMAC. It allows 300 seconds of clock skew.
- It then checks that the stored account matches. It also checks `?account=` when that query is present. An unknown monitor, a bad signature, and an account mismatch all get the same rejection.
- The Worker does not return the secret. It does not log the secret. It does not publish the secret.

### Machines (A2, B, C)

- The saved snapshots are `tensquads-market-0-1-0` and `tensquads-website-0-1-0`. The Worker maps each agent to its snapshot with an explicit table. It does not parse the snapshot name.
- The image tags are `registry.agents.co/market:0.1.0` and `registry.agents.co/website:0.1.0`.
- A machine's environment holds `ACCOUNT_ID`, `TENSQUADS_AGENT_ID` and `IMAGE_TAG`. Boat adds the placeholder variables for `TENSQUADS_MACHINE_TOKEN` and `CONTEXT_DEV` from the per-machine profile `tensquads.<len>.<accountId>.<len>.<agentId>`.

## Work packages

| Package | Repository | Gaps from the audit | Depends on |
| --- | --- | --- | --- |
| K: kit contract | `tensquads-agent-kit` | 7, 10, 11 (kit side) | none |
| A1: master loop and projections | `tensquads` | 1, 7, 8, 10, 11, 13, 14 | K contract (build to the contract above; pin v0.3.0 when it exists) |
| A2: machine lifecycle | `tensquads` | 12, 16, 17, 18 | none |
| A3: real deploy path and bootstrap | `tensquads` | 21, 22, and the missing `env.real` names | none |
| A4: preview and publish routes | `tensquads` | 5, 6, 9 (code side) | none |
| B: researcher | `tensquads-market-researcher` | 2, 3, 15, and decision 6 | K |
| C: website builder | `tensquads-website-builder` | 4, 5, 6, 8, 19 | K, A4 contract |

The orchestrator does the cloud setup, the secrets, the Neon branch, the snapshot releases (gap 20) and the run itself (gap 23).

## Rules for every package

- Write the failing test first.
- No widened waits, no retries, no skips.
- Never put a key on a machine, in a prompt, in a log, or in git.
- Never write to the live database. Never deploy. Never create cloud resources. The orchestrator does that.
- Production stays `ADAPTERS=test`. The nine done numbers stay the same.
- Sign every commit (DCO). Never force-push. Never push to main.
- Push with a plain `git push` to the package branch. This is an exception to the `git push no-mistakes` rule in `AGENTS.md`. The no-mistakes pipeline jammed on 5 November 2026 and held PRs #32 and #28, so the orchestrator moved builders to direct pushes. CI runs the same checks (`make verify`, Fallow, DCO) on every push, and no PR merges before CI is green. The orchestrator restores the no-mistakes push when the pipeline is fixed.
