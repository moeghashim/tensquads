export type BusinessType = "restaurant" | "grocer";

export interface ListedItem {
	readonly name: string;
	readonly price: string;
	readonly section: string;
}

export interface GapEvidence {
	readonly sourceUrl: string;
	readonly quote: string;
}

export interface Competitor {
	readonly name: string;
	readonly url: string;
	readonly priceOrOffer: string;
	readonly sourceUrl: string;
}

export interface ResearchReport {
	readonly competitors: readonly Competitor[];
	readonly gap: string;
	readonly gapEvidence: GapEvidence;
	readonly sources: readonly string[];
}

export interface BusinessRequest {
	readonly businessName: string;
	readonly businessType: BusinessType;
	readonly items: readonly ListedItem[];
	readonly cuisine?: string;
}

export interface PageAudit {
	readonly keyboard: boolean;
	readonly contrast: boolean;
	readonly p0: number;
	readonly p1: number;
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

// Kit v0.1.1 (516f6e13) Mandate. The rules screen keeps its own Mandate type.
export interface PocMandate {
	readonly approvalId: string;
	readonly ruleId: string;
	readonly ruleWhen: string;
	readonly ruleAction: string;
	readonly ruleApproval: string;
	readonly limitValue: number;
	readonly policyVersion: string;
	readonly saidYes: string;
	readonly at: string;
	readonly subject: string;
}

const MANDATE_AT = "2026-11-05T12:00:00.000Z";

export function mandateFor(input: {
	readonly approvalId: string;
	readonly ruleId: string;
	readonly ruleWhen: string;
	readonly ruleAction: string;
	readonly subject: string;
	readonly at?: string;
}): PocMandate {
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
