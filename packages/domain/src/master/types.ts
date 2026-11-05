import type { BusinessType, ListedItem, Mandate } from "@tensquads/agent-kit";

export interface BusinessRequest {
	readonly businessName: string;
	readonly businessType: BusinessType;
	readonly items: readonly ListedItem[];
	readonly cuisine?: string;
	readonly sections?: readonly string[];
}

export interface PageAudit {
	readonly keyboard: boolean;
	readonly contrast: boolean;
	readonly horizontalScroll: boolean;
}

export interface PageFetch {
	readonly status: number;
	readonly body: string;
}

export type PageReader = (url: string) => Promise<PageFetch>;

export interface CheckOutcome {
	readonly pass: boolean;
	readonly evidence: readonly string[];
}

const MANDATE_AT = "2026-11-05T12:00:00.000Z";

export function mandateFor(input: {
	readonly approvalId: string;
	readonly ruleId: string;
	readonly ruleWhen: string;
	readonly ruleAction: string;
	readonly subject: string;
	readonly at?: string;
}): Mandate {
	return {
		approvalId: input.approvalId,
		ruleId: input.ruleId,
		ruleWhen: input.ruleWhen,
		ruleAction: input.ruleAction,
		ruleApproval: "Ask first",
		limitValue: 0,
		policyVersion: "poc-1",
		saidYes: "user",
		at: input.at ?? MANDATE_AT,
		subject: input.subject,
	};
}
