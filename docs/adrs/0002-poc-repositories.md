# ADR 0002: Proof-of-concept agents live in their own repositories

## Status

Accepted

## Date

2026-11-04

## Context

Phase 5 runs three squads. The master stays on Cloudflare (decision 17). The Market researcher and the Website builder each run on a boat.dev machine. Moe wants each of those two agents to have its own repository and its own development thread.

Both agents need the same bus contract and the same agent loop. A second copy of that loop would drift. `AGENTS.md` says the decisions table fixes the architecture, so the split needs a row in that table.

## Decision

Moe accepted this split on 4 November 2026.

- `moeghashim/tensquads-market-researcher` is private. It holds the Market researcher.
- `moeghashim/tensquads-website-builder` is private. It holds the Website builder.
- `moeghashim/tensquads-agent-kit` is private. It holds the shared bus contract and the agent loop.
- A consumer pins one commit of the kit with an npm git dependency. The pin is the commit. It is not a tag name and it is not a version range.
- The master stays in `moeghashim/tensquads`. The kit holds no master logic and no check that decides a pass.
- Four task files replace the single phase 5 task. `tasks/05-proof-of-concept.md` keeps the final "Done when" list.

Decision 35 in `docs/PLAN.md` is this decision. A change to the bus contract is a new kit version. Update each consumer in its own pull request.

## Alternatives considered

### Keep both agents in `moeghashim/tensquads`

- Pros: one repository, one review path.
- Cons: Moe asked for one repository per agent, and for one thread per agent.
- Rejected: it does not meet the request.

### Copy the loop into each agent repository

- Pros: an agent repository builds with no extra pin.
- Cons: two copies of the loop will diverge.
- Rejected: the kit keeps one copy.

### Publish the kit to a package registry

- Pros: consumers install a version number.
- Cons: the kit then needs a registry, and a version number can move.
- Rejected: a git commit pin needs no registry.

### Make the three repositories public

- Pros: no access grant for the kit.
- Cons: an image holds prompts and skills.
- Rejected: the repositories are private. A private consumer needs access to the kit.

## Consequences

- The kit releases version 0.1.0 before either agent uses it.
- The researcher and the builder can proceed at the same time after that release.
- The main repository runs the full loop last. It pins the kit commit and both image releases.
- An agent repository holds no check that decides a pass. The master core in `moeghashim/tensquads` runs every check (decision 20).
