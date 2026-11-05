import type { BusinessType, Competitor, GapEvidence, ListedItem, ResearchReport } from "@tensquads/agent-kit";

import { pageLinks } from "./hrefs.ts";
import { parsePageChoice, renderPage } from "./page-render.ts";
import type { RenderedPage } from "./render-page.ts";
import type { CheckOutcome, PageAudit, PageFetch, PageReader } from "./types.ts";

export interface PageCheckInput {
	readonly previewUrl: string;
	readonly businessName: string;
	readonly businessType: BusinessType;
	readonly cuisine?: string;
	readonly items: readonly ListedItem[];
	readonly sections?: readonly string[];
	readonly choice: unknown;
	readonly readPage: PageReader;
	readonly audit: (html: string) => PageAudit | Promise<PageAudit>;
	readonly browser?: (html: string) => Promise<RenderedPage>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function outcome(evidence: string[]): CheckOutcome {
	return { pass: evidence.length === 0, evidence };
}

export function wordCount(text: string): number {
	const trimmed = text.trim();
	if (trimmed.length === 0) return 0;
	return trimmed.split(/\s+/).length;
}

function textList(value: unknown): string[] | null {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
	return value as string[];
}

function readCompetitor(value: unknown): Competitor | null {
	if (!isRecord(value)) return null;
	if (typeof value.name !== "string" || typeof value.url !== "string") return null;
	if (typeof value.priceOrOffer !== "string" || typeof value.sourceUrl !== "string") return null;
	return { name: value.name, url: value.url, priceOrOffer: value.priceOrOffer, sourceUrl: value.sourceUrl };
}

function readEvidence(value: unknown): GapEvidence | null {
	if (!isRecord(value)) return null;
	if (typeof value.sourceUrl !== "string" || typeof value.quote !== "string") return null;
	if (value.sourceUrl.length === 0 || value.quote.length === 0) return null;
	return { sourceUrl: value.sourceUrl, quote: value.quote };
}

export function readReport(value: unknown): ResearchReport | null {
	if (!isRecord(value) || typeof value.gap !== "string" || value.gap.trim().length === 0) return null;
	const gapEvidence = readEvidence(value.gapEvidence);
	const sources = textList(value.sources);
	if (!gapEvidence || !sources || !Array.isArray(value.competitors)) return null;
	const competitors: Competitor[] = [];
	for (const entry of value.competitors) {
		const competitor = readCompetitor(entry);
		if (!competitor) return null;
		competitors.push(competitor);
	}
	return { competitors, gap: value.gap, gapEvidence, sources };
}

async function readSafe(readPage: PageReader, url: string): Promise<PageFetch> {
	try {
		return await readPage(url);
	} catch {
		return { status: 404, body: "" };
	}
}

function hostOf(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
		return parsed.host;
	} catch {
		return null;
	}
}

function pageKey(url: string): string {
	try {
		const parsed = new URL(url);
		parsed.hash = "";
		return parsed.href;
	} catch {
		return url;
	}
}

async function noteCompetitor(
	evidence: string[],
	competitor: Competitor,
	sources: readonly string[],
	seenPages: Set<string>,
	readPage: PageReader,
): Promise<void> {
	if (competitor.priceOrOffer.trim().length === 0) evidence.push("A competitor has no price or offer.");
	if (!sources.includes(competitor.sourceUrl)) evidence.push("The report was rejected.");
	const page = pageKey(competitor.url);
	if (seenPages.has(page)) evidence.push("The report repeats a competitor.");
	else seenPages.add(page);
	const site = hostOf(competitor.url);
	if (site === null || site !== hostOf(competitor.sourceUrl)) {
		evidence.push("The source is not on the competitor site.");
		return;
	}
	await noteCompetitorPages(evidence, competitor, readPage);
}

async function noteCompetitorPages(evidence: string[], competitor: Competitor, readPage: PageReader): Promise<void> {
	const page = await readSafe(readPage, competitor.url);
	const source = await readSafe(readPage, competitor.sourceUrl);
	if (page.status !== 200 || source.status !== 200) {
		evidence.push("A competitor URL did not return 200.");
		return;
	}
	if (!source.body.includes(competitor.priceOrOffer)) evidence.push("A price or offer is not on the page.");
}

export async function checkResearch(report: unknown, readPage: PageReader): Promise<CheckOutcome> {
	const parsed = readReport(report);
	if (!parsed) return outcome(["The report was rejected."]);
	const evidence: string[] = [];
	if (parsed.competitors.length < 3) evidence.push("The report needs three competitors.");
	if (!parsed.sources.includes(parsed.gapEvidence.sourceUrl)) evidence.push("The report was rejected.");
	const seenPages = new Set<string>();
	for (const competitor of parsed.competitors) {
		await noteCompetitor(evidence, competitor, parsed.sources, seenPages, readPage);
	}
	const source = await readSafe(readPage, parsed.gapEvidence.sourceUrl);
	if (source.status !== 200 || !source.body.includes(parsed.gapEvidence.quote)) {
		evidence.push("The gap quote is not on the source page.");
	}
	return outcome(evidence);
}

export function checkBrief(brief: string, report: ResearchReport): CheckOutcome {
	const evidence: string[] = [];
	if (wordCount(brief) >= 150) evidence.push("The brief is 150 words or more.");
	if (!brief.includes(report.gap)) evidence.push("The brief does not name the gap.");
	return outcome(evidence);
}

const failedLayout: PageAudit = { keyboard: false, contrast: false, horizontalScroll: true };

async function auditSafe(audit: PageCheckInput["audit"], html: string): Promise<PageAudit> {
	try {
		return await audit(html);
	} catch {
		return failedLayout;
	}
}

async function noteLinks(evidence: string[], links: readonly string[], readPage: PageReader): Promise<void> {
	for (const href of links) {
		const linked = await readSafe(readPage, href);
		if (linked.status !== 200) evidence.push("A link is broken.");
	}
}

interface LayoutFlags {
	readonly keyboard: boolean;
	readonly contrast: boolean;
	readonly horizontalScroll: boolean;
}

function noteLayout(evidence: string[], layout: LayoutFlags): void {
	if (!layout.keyboard) evidence.push("The keyboard check failed.");
	if (!layout.contrast) evidence.push("The contrast check failed.");
	if (layout.horizontalScroll) evidence.push("The page scrolls sideways at 390 px.");
}

interface CheckedPage extends CheckOutcome {
	readonly html: string;
}

function renderedBytes(input: PageCheckInput): string | null {
	const choice = parsePageChoice(input.choice);
	if (!choice) return null;
	return renderPage(
		{
			businessName: input.businessName,
			businessType: input.businessType,
			items: input.items,
			...(input.cuisine ? { cuisine: input.cuisine } : {}),
			...(input.sections ? { sections: input.sections } : {}),
		},
		choice,
	);
}

export async function checkPage(input: PageCheckInput): Promise<CheckedPage> {
	const evidence: string[] = [];
	const preview = await readSafe(input.readPage, input.previewUrl);
	if (preview.status !== 200) return { ...outcome(["The preview URL did not return 200."]), html: "" };
	const html = preview.body;
	if (renderedBytes(input) !== html) evidence.push("The preview does not match the rendered page.");
	await noteLinks(evidence, pageLinks(html, input.previewUrl), input.readPage);
	await noteSecondLayer(evidence, input, html);
	return { ...outcome(evidence), html };
}

async function noteSecondLayer(evidence: string[], input: PageCheckInput, html: string): Promise<void> {
	if (input.browser) {
		noteLayout(evidence, await input.browser(html));
		return;
	}
	noteLayout(evidence, await auditSafe(input.audit, html));
}

function accountSite(url: string, slug: string): boolean {
	if (!/^[a-z0-9-]+$/.test(slug)) return false;
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "https:") return false;
		if (parsed.username.length > 0 || parsed.password.length > 0) return false;
		if (parsed.port.length > 0) return false;
		if (parsed.pathname !== "/") return false;
		if (parsed.search.length > 0 || parsed.hash.length > 0) return false;
		return parsed.hostname === `${slug}.10squads.com`;
	} catch {
		return false;
	}
}

export async function checkPublished(
	previewHtml: string,
	publishedUrl: string,
	readPage: PageReader,
	accountSlug: string,
): Promise<CheckOutcome> {
	if (!accountSite(publishedUrl, accountSlug)) return outcome(["The published URL is not the account site."]);
	const page = await readSafe(readPage, publishedUrl);
	if (page.status !== 200) return outcome(["The published URL did not return 200."]);
	if (page.body !== previewHtml) return outcome(["The published page does not match the preview."]);
	return outcome([]);
}
