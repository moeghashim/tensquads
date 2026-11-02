import type { AccountScope, Rule, RuleDraft, StoredLimit } from "@tensquads/domain";

import { policyApprovals } from "./policy-approvals.ts";
import { policyRules } from "./policy-rules.ts";

export interface PolicyCommands {
	setRuleOn(scope: AccountScope, id: string, on: boolean, deadlineAt?: number): Promise<Rule>;
	addRule(scope: AccountScope, draft: RuleDraft, deadlineAt?: number): Promise<Rule | null>;
	setLimit(scope: AccountScope, key: string, value: number, deadlineAt?: number): Promise<StoredLimit>;
}

export function policy(
	context: { provide(name: string, service: PolicyCommands): unknown },
	config: { repositories: () => { readonly policy: PolicyCommands } },
): void {
	policyApprovals();
	policyRules();
	context.provide("workspacePolicy", {
		setRuleOn: (scope, id, on, deadlineAt) => config.repositories().policy.setRuleOn(scope, id, on, deadlineAt),
		addRule: (scope, draft, deadlineAt) => config.repositories().policy.addRule(scope, draft, deadlineAt),
		setLimit: (scope, key, value, deadlineAt) => config.repositories().policy.setLimit(scope, key, value, deadlineAt),
	});
}
