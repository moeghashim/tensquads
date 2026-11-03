import type { AccountScope, Fenced, Rule, RuleDraft, StoredLimit, WriteFence } from "@tensquads/domain";

import { type PolicyApprovalConfig, policyApprovals } from "./policy-approvals.ts";
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
	context: { provide(name: string, service: unknown): unknown },
	config: PolicyApprovalConfig,
): void {
	policyApprovals(context, config);
	policyRules();
	const policyCommands = (): PolicyCommands => (config.repositories() as { readonly policy: PolicyCommands }).policy;
	const workspacePolicy: PolicyCommands = {
		setRuleOn: (scope, id, on, fence, deadlineAt) => policyCommands().setRuleOn(scope, id, on, fence, deadlineAt),
		addRule: (scope, draft, deadlineAt) => policyCommands().addRule(scope, draft, deadlineAt),
		setLimit: (scope, key, value, fence, deadlineAt) =>
			policyCommands().setLimit(scope, key, value, fence, deadlineAt),
	};
	context.provide("workspacePolicy", workspacePolicy);
}
