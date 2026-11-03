# Image release

One image is Draft, Beta, Stable, or Needs attention. Stable and Needs attention move both ways. The status is stored. It is not derived from bugs. The attention badge equals the count of Needs attention images. On latest shows onLatest of deployed, or Not deployed yet. Roll out does nothing in version 1. The chart hides that step and a deploy-count change, because neither changes what the reader sees. An update never changes limits, rules, autonomy, or keys. A rollout stops after two failed health checks and the accounts stay on the stable version. When no rollout is running, every account runs that same stable version. The seed can show a Stable image that is not fully on the latest deploy. That display is not this rule. The rule holds only while no rollout is running. There is no Rollout object in the code.

## When this applies

Run this check when a change touches any of these:

- `packages/domain/src/catalog/image-view.ts`
- `packages/domain/test/admin-view.test.ts`
- `packages/seed/test/admin-view.test.ts`
- `packages/statecharts/image-release/ImageRelease.tla`
- `packages/statecharts/image-release/ImageRelease.cfg`
- `packages/statecharts/image-release/view.mjs`
- `packages/statecharts/image-release/chart.mmd`

A rename or a move of one of these files is still a covered change.

## Run

Run the code check from the repository root:

```sh
node --experimental-strip-types --test packages/domain/test/admin-view.test.ts packages/seed/test/admin-view.test.ts
```

Exit 0 means the account and image views still match the design formulas, including "Nothing requested yet." and "22 of 34 (65%)". A failure is a break in the code. Do not change the test to hide it.

Then read the model with `/statechart`. The spec is `packages/statecharts/image-release/ImageRelease.tla`. The config is `packages/statecharts/image-release/ImageRelease.cfg`. The view is `packages/statecharts/image-release/view.mjs`. The chart is `packages/statecharts/image-release/chart.mmd`. `/statechart` is the only way to read the TLC result. Do not copy its command into this skill or into a script.

Exit 0 and a report that names no broken rule means the model holds. A broken rule is a finding. Do not weaken an invariant so that the run passes.

TLC does not read `image-view.ts`. A pass of the model does not prove the TypeScript. Run both checks.

## What a failure means

A model failure is a path of a status change, a rollout start, a health check that passes, a second failed health check, or Roll out. Replay that path in `onLatestLine`, `attentionCount`, and `imageCatalogView`. The code reads the stored status and does not start a rollout. Roll out and View changelog have no handler. If the code can change limits, rules, autonomy, or keys while it only renders an image, the code is wrong. If the code cannot do a step, the model is wrong. Say which.

## Keep the check in step

| Check | Covers | Sync commit |
| --- | --- | --- |
| `admin-view.test.ts` | Seed totals, filters, on latest, nothing requested | pending |
| `/statechart` on `ImageRelease.tla` | Status, attention badge, on latest, rollout stop, same version while idle | pending |

Move a sync commit forward only after both checks pass and you confirm that the model and the tests still describe the code at the new commit.
