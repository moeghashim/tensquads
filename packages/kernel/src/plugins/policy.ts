import { policyApprovals } from "./policy-approvals.ts";
import { policyRules } from "./policy-rules.ts";

export function policy(): void {
	policyApprovals();
	policyRules();
}
