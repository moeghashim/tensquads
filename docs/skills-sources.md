# Skill sources

The imported skills under `.agents/skills/` come from two places. `.claude/skills` is a link to that folder.

PI-Starter skills were copied from https://github.com/moeghashim/PI-Starter at commit `de976cc12b3e9dcf1845de61b24c2c0df4fc5914`. Their folder names are unchanged.

Pstack skills were copied from https://github.com/cursor/plugins at commit `4dd1d05818d19792e7cd6e818f1667f95f7e1dbe`, path `pstack/skills`. The folder names are the source names:

- architect
- create-formal-verification-skill
- interrogate
- maintain-formal-verification-skill
- principle-boundary-discipline
- principle-make-operations-idempotent
- principle-model-the-domain
- principle-prove-it-works
- principle-separate-before-serializing-shared-state
- principle-sequence-verifiable-units
- principle-test-behavior-not-implementation
- statechart
- tdd
- unslop

`tensquads-verify` is local to this repository. It records the Approval code checks, model checks, sync commits, and model bounds. Run it after changes to the inbox decision functions or the Approval model. The automatic statechart gate only watches `packages/statecharts`; it does not detect changes to those domain functions.

Impeccable was installed from https://impeccable.style with `npx impeccable@4.8.0 install --project --providers=codex --no-hooks`. The skill version is 4.8.0, from GitHub tag `skill-v4.8.0` at commit `414603bf14c7a344edb466bb1f85690c77ce8b7d` (https://github.com/pbakaus/impeccable). The folder is `.agents/skills/impeccable`. The engine binary downloads on first run (engine 0.1.18). It is not committed. `.claude/skills` is already a link to `.agents/skills`.
