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
