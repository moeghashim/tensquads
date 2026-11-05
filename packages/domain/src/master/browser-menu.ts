import type { RenderedPage } from "./render-page.ts";

interface MenuItem {
	readonly name: string;
	readonly price: string;
	readonly section: string;
}

export interface RenderedMenu {
	readonly businessName: string;
	readonly cuisine?: string;
	readonly items: readonly MenuItem[];
}

const MONEY = /\[PRICE\]|[$€£¥]\s?\d+(?:\.\d+)?/g;

function shownPrice(price: string): string {
	return price.trim().length === 0 ? "[PRICE]" : price;
}

function extraMoney(text: string, items: readonly MenuItem[]): boolean {
	const expected = new Map<string, number>();
	for (const item of items) {
		const price = shownPrice(item.price);
		expected.set(price, (expected.get(price) ?? 0) + 1);
	}
	const seen = new Map<string, number>();
	for (const match of text.matchAll(MONEY)) {
		const price = (match[0] ?? "").replace(/\s+/g, "");
		seen.set(price, (seen.get(price) ?? 0) + 1);
	}
	for (const [price, count] of seen) {
		if (count > (expected.get(price) ?? 0)) return true;
	}
	return false;
}

function allowedPhrases(input: RenderedMenu, linkTexts: readonly string[]): string[] {
	const phrases = [input.businessName];
	if (input.cuisine) phrases.push(input.cuisine);
	for (const item of input.items) phrases.push(item.name, item.section, shownPrice(item.price));
	for (const link of linkTexts) phrases.push(link);
	return phrases.filter((phrase) => phrase.trim().length > 0).sort((left, right) => right.length - left.length);
}

function extraWords(text: string, input: RenderedMenu, linkTexts: readonly string[]): boolean {
	let rest = text;
	for (const phrase of allowedPhrases(input, linkTexts)) rest = rest.split(phrase).join(" ");
	return /[A-Za-z]/.test(rest);
}

export function noteRendered(evidence: string[], page: RenderedPage, input: RenderedMenu): void {
	const text = [page.visibleText, ...page.cssContent].join(" ");
	const missing = input.items.some((item) => !text.includes(item.name) || !text.includes(shownPrice(item.price)));
	if (missing) evidence.push("An item from the list is missing.");
	if (page.imageCount > 0 || extraMoney(text, input.items) || extraWords(text, input, page.linkTexts)) {
		evidence.push("The page invents an item.");
	}
	if (page.horizontalScroll) evidence.push("The page scrolls sideways at 390 px.");
	if (!page.keyboard) evidence.push("The keyboard check failed.");
	if (!page.contrast) evidence.push("The contrast check failed.");
}
