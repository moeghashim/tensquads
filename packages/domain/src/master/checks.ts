import type { BusinessType, Competitor, GapEvidence, ListedItem, ResearchReport } from "@tensquads/agent-kit";

import type { CheckOutcome, PageAudit, PageFetch, PageReader } from "./types.ts";
import { visibleText } from "./visible.ts";

export interface PageCheckInput {
	readonly previewUrl: string;
	readonly businessName: string;
	readonly businessType: BusinessType;
	readonly cuisine?: string;
	readonly items: readonly ListedItem[];
	readonly readPage: PageReader;
	readonly audit: (html: string) => PageAudit | Promise<PageAudit>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function outcome(evidence: string[]): CheckOutcome {
	return { pass: evidence.length === 0, evidence };
}

function shownPrice(price: string): string {
	return price.trim().length === 0 ? "[PRICE]" : price;
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
	const fetched = await readSafe(readPage, competitor.sourceUrl);
	if (fetched.status !== 200) evidence.push("A competitor URL did not return 200.");
	else if (!fetched.body.includes(competitor.priceOrOffer)) evidence.push("A price or offer is not on the page.");
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

interface ParsedRow {
	readonly name: string;
	readonly price: string;
	readonly section: string;
}

function resolveHref(href: string, previewUrl: string): string | null {
	if (href.length === 0 || href.startsWith("#")) return null;
	try {
		const url = new URL(href, previewUrl);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		return url.href;
	} catch {
		return null;
	}
}

function pageLinks(html: string, previewUrl: string): string[] {
	const links: string[] = [];
	const linkRe = /href\s*=\s*("([^"]*)"|'([^']*)')/g;
	for (const match of html.matchAll(linkRe)) {
		const resolved = resolveHref(match[2] ?? match[3] ?? "", previewUrl);
		if (resolved) links.push(resolved);
	}
	return links;
}

function parsedPage(html: string, previewUrl: string): { rows: ParsedRow[]; sections: string[]; links: string[] } {
	const sections: string[] = [];
	const rows: ParsedRow[] = [];
	const sectionRe = /<section>\s*<h2>([^<]*)<\/h2>([\s\S]*?)<\/section>/g;
	const rowRe = /<span class="name">([^<]*)<\/span>\s*<span class="price">([^<]*)<\/span>/g;
	for (const match of html.matchAll(sectionRe)) {
		const section = match[1] ?? "";
		const body = match[2] ?? "";
		sections.push(section);
		for (const row of body.matchAll(rowRe)) {
			rows.push({ name: row[1] ?? "", price: row[2] ?? "", section });
		}
	}
	return { rows, sections, links: pageLinks(html, previewUrl) };
}

const PRICE_RE = /\[PRICE\]|\$\d+(?:\.\d+)?/g;

function noteVisibleMenu(evidence: string[], html: string, items: readonly ListedItem[]): void {
	const text = visibleText(html);
	const expected = new Map<string, number>();
	for (const item of items) {
		const price = shownPrice(item.price);
		if (!text.includes(item.name) || !text.includes(price)) evidence.push("An item from the list is missing.");
		expected.set(price, (expected.get(price) ?? 0) + 1);
	}
	const seen = new Map<string, number>();
	for (const match of text.matchAll(PRICE_RE)) {
		const price = match[0] ?? "";
		seen.set(price, (seen.get(price) ?? 0) + 1);
	}
	for (const [price, count] of seen) {
		if (count > (expected.get(price) ?? 0)) evidence.push("The page invents an item.");
	}
}

function userSections(items: readonly ListedItem[]): string[] {
	const names: string[] = [];
	for (const item of items) {
		if (!names.includes(item.section)) names.push(item.section);
	}
	return names;
}

const failedAudit: PageAudit = { keyboard: false, contrast: false, p0: 1, p1: 1, horizontalScroll: true };

async function auditSafe(audit: PageCheckInput["audit"], html: string): Promise<PageAudit> {
	try {
		return await audit(html);
	} catch {
		return failedAudit;
	}
}

function noteIdentity(evidence: string[], html: string, input: PageCheckInput): void {
	if (!html.includes(input.businessName)) evidence.push("The page omits the business name.");
	const cuisineMissing = input.businessType === "restaurant" && (!input.cuisine || !html.includes(input.cuisine));
	if (cuisineMissing) evidence.push("The cuisine is missing from the page.");
}

function noteSections(evidence: string[], sections: readonly string[], items: readonly ListedItem[]): void {
	const expected = userSections(items);
	const sameOrder = sections.length === expected.length && sections.every((name, index) => name === expected[index]);
	if (!sameOrder) evidence.push("A section is out of order.");
}

function noteRow(evidence: string[], row: ParsedRow, items: readonly ListedItem[], seen: Set<string>): void {
	if (seen.has(row.name)) evidence.push("The page repeats an item.");
	seen.add(row.name);
	const item = items.find((entry) => entry.name === row.name);
	if (!item) {
		evidence.push("The page invents an item.");
		return;
	}
	if (row.price !== shownPrice(item.price)) evidence.push("An item price does not match the list.");
	if (row.section !== item.section) evidence.push("An item is in the wrong section.");
}

function noteItems(evidence: string[], rows: readonly ParsedRow[], items: readonly ListedItem[]): void {
	const seen = new Set<string>();
	for (const row of rows) noteRow(evidence, row, items, seen);
	for (const item of items) {
		if (!seen.has(item.name)) evidence.push("An item from the list is missing.");
	}
}

async function noteLinks(evidence: string[], links: readonly string[], readPage: PageReader): Promise<void> {
	for (const href of links) {
		const linked = await readSafe(readPage, href);
		if (linked.status !== 200) evidence.push("A link is broken.");
	}
}

function noteAudit(evidence: string[], audit: PageAudit): void {
	if (!audit.keyboard) evidence.push("The keyboard check failed.");
	if (!audit.contrast) evidence.push("The contrast check failed.");
	if (audit.p0 > 0 || audit.p1 > 0) evidence.push("The page has a P0 or P1 finding.");
	if (audit.horizontalScroll) evidence.push("The page scrolls sideways at 390 px.");
}

interface CheckedPage extends CheckOutcome {
	readonly html: string;
}

export async function checkPage(input: PageCheckInput): Promise<CheckedPage> {
	const evidence: string[] = [];
	const preview = await readSafe(input.readPage, input.previewUrl);
	if (preview.status !== 200) return { ...outcome(["The preview URL did not return 200."]), html: "" };
	const html = preview.body;
	const parsed = parsedPage(html, input.previewUrl);
	noteIdentity(evidence, html, input);
	noteSections(evidence, parsed.sections, input.items);
	noteItems(evidence, parsed.rows, input.items);
	noteVisibleMenu(evidence, html, input.items);
	await noteLinks(evidence, parsed.links, input.readPage);
	noteAudit(evidence, await auditSafe(input.audit, html));
	return { ...outcome(evidence), html };
}

function accountSite(url: string): boolean {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "https:") return false;
		if (parsed.username.length > 0 || parsed.password.length > 0) return false;
		if (parsed.port.length > 0) return false;
		if (parsed.pathname !== "/") return false;
		if (parsed.search.length > 0 || parsed.hash.length > 0) return false;
		return /^[a-z0-9-]+\.10squads\.com$/.test(parsed.hostname);
	} catch {
		return false;
	}
}

export async function checkPublished(
	previewHtml: string,
	publishedUrl: string,
	readPage: PageReader,
): Promise<CheckOutcome> {
	if (!accountSite(publishedUrl)) return outcome(["The published URL is not the account site."]);
	const page = await readSafe(readPage, publishedUrl);
	if (page.status !== 200) return outcome(["The published URL did not return 200."]);
	if (page.body !== previewHtml) return outcome(["The published page does not match the preview."]);
	return outcome([]);
}
