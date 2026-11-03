import type { AccountScope, Fenced, Rule, RuleDraft, StoredLimit, WriteFence } from "@tensquads/domain";

import { policyApprovals } from "./policy-approvals.ts";
import { policyRules } from "./policy-rules.ts";

export interface PolicyCommands {
	setRuleOn(
		scope: AccountScope,
		id: string,
		on: boolean,
		fence: WriteFence,
		deadlineAt?: number,
	): Promise<Fenced<Rule>>;
	addRule(scope: AccountScope, draft: RuleDraft, deadlineAt?: number): Promise<Rule | null>;
	setLimit(
		scope: AccountScope,
		key: string,
		value: number,
		fence: WriteFence,
		deadlineAt?: number,
	): Promise<Fenced<StoredLimit>>;
}

export function policy(
	context: { provide(name: string, service: PolicyCommands): unknown },
	config: { repositories: () => { readonly policy: PolicyCommands } },
): void {
	policyApprovals();
	policyRules();
	context.provide("workspacePolicy", {
		setRuleOn: (scope, id, on, fence, deadlineAt) =>
			config.repositories().policy.setRuleOn(scope, id, on, fence, deadlineAt),
		addRule: (scope, draft, deadlineAt) => config.repositories().policy.addRule(scope, draft, deadlineAt),
		setLimit: (scope, key, value, fence, deadlineAt) =>
			config.repositories().policy.setLimit(scope, key, value, fence, deadlineAt),
	});
}
