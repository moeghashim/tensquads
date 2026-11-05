# tensquads

A small business runs its operations through a squad of AI agents. One master agent coordinates them.

This repository is the handoff package for the build. Start with `AGENTS.md`.

| Path | What it is |
| --- | --- |
| `AGENTS.md` | The rules for every agent. Read it first, every session |
| `docs/PLAN.md` | The build plan with the 28 decisions |
| `docs/BRIEF.md` | The original build brief |
| `design/` | The design files, copied from the canvas. `MANIFEST.json` holds the canvas version and each file's hash |
| `design/inventory/` | What each design file contains, listed by a script: texts, styles, colours, handlers, strings |
| `scripts/design-check.mjs` | Proves `design/` matches the canvas |
| `scripts/design-inventory.mjs` | Makes `design/inventory/` |
| `tasks/` | One task file per unit of work. `00-foundation.md` is first; `05-proof-of-concept.md` is the three-squad proof of concept |

The design canvas: https://claude.ai/artifact/B7seDz5psECQTerDG6rfy4
The plan: https://claude.ai/artifact/21JpQUuhEFqLZL8dPrj8NN

## Tests

`make verify` runs the checks, including the Clerk test-user sweep. Playwright listens on `TS_E2E_PORT`. CI leaves that variable unset and uses port 3000. On a laptop, an unset variable uses a free port taken from the worktree path. A port is free when both `127.0.0.1` and `::1` can take it, because the dev server listens on `::1`. `make verify` takes `/tmp/ts-e2e.lock`, the same directory as `sh /tmp/ts-e2e-lock.sh`, so two worktrees take turns. Set `TS_VERIFY_PARALLEL=1` to run two verifies at once. Each worktree still uses its own port. Before the first test, the dev server answers each screen once, so a test is not the first request to a cold route. `sh scripts/with-verify-lock.sh` runs one other command at a time on `/tmp/ts-e2e.lock`. `make help` prints the same note.
