import type { AccountScope, Rule, RuleDraft, StoredLimit } from "@tensquads/domain";

import { policyApprovals } from "./policy-approvals.ts";
import { policyRules } from "./policy-rules.ts";

export interface PolicyCommands {
	setRuleOn(scope: AccountScope, id: string, on: boolean): Promise<Rule>;
	addRule(scope: AccountScope, draft: RuleDraft): Promise<Rule | null>;
	setLimit(scope: AccountScope, key: string, value: number): Promise<StoredLimit>;
}

export function policy(
	context: { provide(name: string, service: PolicyCommands): unknown },
	config: { repositories: () => { readonly policy: PolicyCommands } },
): void {
	policyApprovals();
	policyRules();
	context.provide("workspacePolicy", {
		setRuleOn: (scope, id, on) => config.repositories().policy.setRuleOn(scope, id, on),
		addRule: (scope, draft) => config.repositories().policy.addRule(scope, draft),
		setLimit: (scope, key, value) => config.repositories().policy.setLimit(scope, key, value),
	});
}
