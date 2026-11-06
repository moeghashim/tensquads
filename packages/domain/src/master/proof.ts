import {
	digestOf,
	type ListedItem,
	type Mandate,
	type PageChoice,
	parseWebsiteTask,
	type ResearchReport,
	renderPage,
} from "@tensquads/agent-kit";

import type { BusEvent, BusKind } from "../bus/types.ts";
import { type BusinessRequest, mandateFor, type PageAudit, type PageFetch } from "./types.ts";

export const PROOF_PREVIEW_URL = "https://preview.example/proof";
const PROOF_PUBLISHED_URL = "https://proof.10squads.com";
const PROOF_GAP = "The menu hides salad prices.";
const PROOF_SOURCE_URL = "https://example.com/gamma";
const PROOF_QUOTE = "The menu hides salad prices.";

const ALPHA = "https://example.com/alpha";
const BETA = "https://example.com/beta";

const proofRequest: BusinessRequest = {
	businessName: "Proof Kitchen",
	businessType: "restaurant",
	cuisine: "Levantine",
	items: [
		{ name: "Chicken tawook", price: "$14", section: "Mains" },
		{ name: "Fattoush", price: "", section: "Salads" },
	],
};

const proofChoice: PageChoice = { template: "page", palette: "task" };

const proofAudit: PageAudit = {
	keyboard: true,
	contrast: true,
	horizontalScroll: false,
};

function proofBrief(): string {
	return "Proof Kitchen serves Levantine food. Competitors list a salad price. The menu hides salad prices. Show Fattoush with a visible price and keep Chicken tawook at $14.";
}

function proofPage(report: ResearchReport, brief: string): string {
	return renderPage(
		parseWebsiteTask({
			businessName: proofRequest.businessName,
			businessType: proofRequest.businessType,
			brief: { text: brief, gap: report.gap },
			report,
			gapEvidence: report.gapEvidence,
			items: proofRequest.items,
			...(proofRequest.cuisine ? { cuisine: proofRequest.cuisine } : {}),
		}),
		proofChoice,
	);
}

function proofReport(): ResearchReport {
	return {
		competitors: [
			{ name: "Alpha Grill", url: ALPHA, priceOrOffer: "$12", sourceUrl: ALPHA },
			{ name: "Beta Wrap", url: BETA, priceOrOffer: "$11", sourceUrl: BETA },
			{ name: "Gamma Bowl", url: PROOF_SOURCE_URL, priceOrOffer: "$9", sourceUrl: PROOF_SOURCE_URL },
		],
		gap: PROOF_GAP,
		gapEvidence: { sourceUrl: PROOF_SOURCE_URL, quote: PROOF_QUOTE },
		sources: [ALPHA, BETA, PROOF_SOURCE_URL],
	};
}

function proofPages(pageHtml: string): Record<string, PageFetch> {
	return {
		[ALPHA]: { status: 200, body: "Alpha plate $12" },
		[BETA]: { status: 200, body: "Beta wrap $11" },
		[PROOF_SOURCE_URL]: { status: 200, body: "Gamma bowl $9. The menu hides salad prices." },
		[PROOF_PREVIEW_URL]: { status: 200, body: pageHtml },
		[PROOF_PUBLISHED_URL]: { status: 200, body: pageHtml },
	};
}

export interface ProofStory {
	readonly request: BusinessRequest;
	readonly report: ResearchReport;
	readonly brief: string;
	readonly pageHtml: string;
	readonly choice: PageChoice;
	readonly previewUrl: string;
	readonly publishedUrl: string;
	readonly events: readonly BusEvent[];
	readonly pages: Record<string, PageFetch>;
	readonly audit: PageAudit;
}

function stamp(
	index: number,
	fields: {
		readonly from: string;
		readonly to: string;
		readonly kind: BusKind;
		readonly skill: string;
		readonly text: string;
		readonly payload: Readonly<Record<string, unknown>>;
	},
): BusEvent {
	const id = `poc-${String(index).padStart(2, "0")}`;
	return {
		id,
		time: `12:${String(index).padStart(2, "0")}`,
		from: fields.from,
		to: fields.to,
		kind: fields.kind,
		skill: fields.skill,
		text: fields.text,
		payload: fields.payload,
		writes: [],
		trace: `tr_${id}`,
	};
}

function approval(skill: string, mandate: Mandate, extra: Readonly<Record<string, unknown>> = {}) {
	return { ...extra, approval: { skill, mandate } };
}

export async function proofStory(): Promise<ProofStory> {
	const request = proofRequest;
	const report = proofReport();
	const brief = proofBrief();
	const pageHtml = proofPage(report, brief);
	const items: readonly ListedItem[] = request.items;
	const buildMandate = mandateFor({
		approvalId: "poc-08",
		ruleId: "poc-brief",
		ruleWhen: "The brief is ready.",
		ruleAction: "site.build",
		subject: await digestOf(brief),
	});
	const publishMandate = mandateFor({
		approvalId: "poc-12",
		ruleId: "poc-publish",
		ruleWhen: "The page passed the check.",
		ruleAction: "site.publish",
		subject: await digestOf(pageHtml),
	});
	const task = {
		businessName: request.businessName,
		businessType: request.businessType,
		brief: { text: brief, gap: report.gap },
		report,
		gapEvidence: report.gapEvidence,
		items,
		cuisine: request.cuisine,
		approval: { skill: "site.build", mandate: buildMandate },
	};
	const events: BusEvent[] = [
		stamp(1, {
			from: "master",
			to: "market",
			kind: "Task",
			skill: "task.route",
			text: "Research this business.",
			payload: {
				businessName: request.businessName,
				businessType: request.businessType,
				items,
				cuisine: request.cuisine,
			},
		}),
		stamp(2, {
			from: "market",
			to: "master",
			kind: "Result",
			skill: "web.search",
			text: "Searched the web for competitors.",
			payload: { query: "Proof Kitchen competitors" },
		}),
		stamp(3, {
			from: "market",
			to: "master",
			kind: "Result",
			skill: "maps.competitors",
			text: "Listed the competitors on the map.",
			payload: { sources: report.sources },
		}),
		stamp(4, {
			from: "market",
			to: "master",
			kind: "Result",
			skill: "scrapling.read_page",
			text: "Read the competitor pages.",
			payload: { urls: report.sources },
		}),
		stamp(5, {
			from: "market",
			to: "master",
			kind: "Result",
			skill: "market.analyse",
			text: "Analysed the offers and the gap.",
			payload: { gap: report.gap },
		}),
		stamp(6, {
			from: "market",
			to: "master",
			kind: "Result",
			skill: "report.write",
			text: "The report, the sources, and the evidence.",
			payload: { report, sources: report.sources, evidence: [report.gapEvidence.quote] },
		}),
		stamp(7, {
			from: "master",
			to: "user",
			kind: "Approval",
			skill: "brief.write",
			text: "Build the site with this brief?",
			payload: { brief: { text: brief, gap: report.gap } },
		}),
		stamp(8, {
			from: "master",
			to: "website",
			kind: "Approval",
			skill: "approval.ask",
			text: "The user said yes.",
			payload: approval("site.build", buildMandate),
		}),
		stamp(9, {
			from: "master",
			to: "website",
			kind: "Task",
			skill: "task.route",
			text: `Build the page. ${report.gap} ${report.gapEvidence.sourceUrl}`,
			payload: task,
		}),
		stamp(10, {
			from: "website",
			to: "master",
			kind: "Result",
			skill: "site.preview",
			text: `The preview is ${PROOF_PREVIEW_URL}`,
			payload: { previewUrl: PROOF_PREVIEW_URL, critique: "site.critique passed", choice: proofChoice },
		}),
		stamp(11, {
			from: "master",
			to: "user",
			kind: "Approval",
			skill: "approval.ask",
			text: "Publish the site?",
			payload: { previewUrl: PROOF_PREVIEW_URL },
		}),
		stamp(12, {
			from: "master",
			to: "website",
			kind: "Approval",
			skill: "approval.ask",
			text: "The user said yes.",
			payload: approval("site.publish", publishMandate, { pageHtml, previewUrl: PROOF_PREVIEW_URL }),
		}),
		stamp(13, {
			from: "website",
			to: "master",
			kind: "Result",
			skill: "site.publish",
			text: PROOF_PUBLISHED_URL,
			payload: { previewUrl: PROOF_PREVIEW_URL, publishedUrl: PROOF_PUBLISHED_URL },
		}),
	];
	return {
		request,
		report,
		brief,
		pageHtml,
		choice: proofChoice,
		previewUrl: PROOF_PREVIEW_URL,
		publishedUrl: PROOF_PUBLISHED_URL,
		events,
		pages: proofPages(pageHtml),
		audit: proofAudit,
	};
}
