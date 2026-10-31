# ADR 0001: Pin cordis to the published 4.0.0-rc.12 commit

## Status

Accepted

## Date

2026-10-31

## Context

The kernel is the composition root for the six domain plug-ins: platform, squads, bus, policy, catalog, and conversation. `docs/PLAN.md` names cordis for that root. The plug-ins must stay empty in phase 0, and a cordis API change must not spread through the repository.

The npm package `cordis@4.0.0-rc.12` is the release the kernel can import. Its `gitHead` is `01b396240ce47cf2779c40af9bc445bb748fe112`. The GitHub default branch of `cordiverse/cordis` was `d8b7ea1dac73f441aa2f02414d1cf90c9c31274e` on 2026-10-31, which is newer than the published tarball. Pinning the unpublished commit would make `Kernel` import a tree that npm does not ship.

## Decision

Depend on `cordis` at exactly `4.0.0-rc.12`, which is commit `01b396240ce47cf2779c40af9bc445bb748fe112`.

`packages/kernel/src/kernel.ts` is the only file that imports cordis. The six plug-ins live in `packages/kernel/src/plugins.ts` and do not import cordis. A test fails when any other file imports cordis.

An update to cordis changes `packages/kernel/src/kernel.ts` and this ADR. It does not change a plug-in, a domain object, or an adapter. The plug-in names stay `platform`, `squads`, `bus`, `policy`, `catalog`, and `conversation`.

## Alternatives considered

### Vendor the GitHub tree at d8b7ea1

- Pros: matches the repository HEAD on the day of the pin.
- Cons: that commit is not the published package. The kernel would import source that `npm install` does not install.
- Rejected: the pin must be a package the kernel can import.

### A floating `^4.0.0-rc.12` range

- Pros: picks up patch releases without an edit.
- Cons: a cordis API change could land without a review of `kernel.ts`.
- Rejected: the update rule is one file plus this ADR, which needs an exact version.

## Consequences

- `packages/kernel/package.json` lists `cordis` as `4.0.0-rc.12`.
- Optional cordis peer dependencies `@cordisjs/plugin-include` and `@cordisjs/plugin-loader` are not installed. Phase 0 does not load plug-ins from disk.
- The five ports (`MachineProvider`, `EventBus`, `IntegrationGateway`, `Repositories`, `Decider`) are interfaces on `Kernel`. No adapter is bound in this package. `Decider.decide` throws `Decider has no adapter in version 1.`
