import type { RuleDraft } from "../../../domain/src/policy/repository.ts";
import { limitDefinitions, limitWrite, nextRuleId, preparedRule } from "../../../domain/src/policy/rule-commands.ts";

export { limitDefinitions, nextRuleId };

// The policy plug-in calls this with no arguments. It does not import cordis.
export function policyRules(): void {}

export function setRuleOn(on: boolean): { readonly on: boolean } {
	return { on };
}

export function addRule(draft: RuleDraft) {
	return preparedRule(draft);
}

export function setLimit(key: string, value: number) {
	return limitWrite(key, value);
}
