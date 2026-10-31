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
| `tasks/` | One task file per unit of work. `00-foundation.md` is first |

The design canvas: https://claude.ai/artifact/B7seDz5psECQTerDG6rfy4
The plan: https://claude.ai/artifact/21JpQUuhEFqLZL8dPrj8NN
