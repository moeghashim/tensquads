import type { BusinessRequest } from "./types.ts";

// Stand-in for agent-kit 0.2.0 `renderPage` and `PageChoice`.
// The kit CI runs the impeccable audit on the kit templates. This check does not repeat that audit.

export interface PageLink {
	readonly href: string;
	readonly text: string;
}

export interface PageChoice {
	readonly links: readonly PageLink[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readLink(value: unknown): PageLink | null {
	if (!isRecord(value)) return null;
	if (typeof value.href !== "string" || typeof value.text !== "string") return null;
	if (value.href.length === 0 || value.text.length === 0) return null;
	return { href: value.href, text: value.text };
}

export function parsePageChoice(value: unknown): PageChoice | null {
	if (!isRecord(value) || !Array.isArray(value.links)) return null;
	const links: PageLink[] = [];
	for (const entry of value.links) {
		const link = readLink(entry);
		if (!link) return null;
		links.push(link);
	}
	return { links };
}

function shownPrice(price: string): string {
	return price.trim().length === 0 ? "[PRICE]" : price;
}

function sectionNames(task: BusinessRequest): readonly string[] {
	if (task.sections && task.sections.length > 0) return task.sections;
	const names: string[] = [];
	for (const item of task.items) {
		if (!names.includes(item.section)) names.push(item.section);
	}
	return names;
}

function sectionHtml(name: string, task: BusinessRequest): string {
	const rows = task.items
		.filter((item) => item.section === name)
		.map(
			(item) =>
				`<div class="row"><span class="name">${item.name}</span><span class="price">${shownPrice(item.price)}</span></div>`,
		)
		.join("");
	return `<section><h2>${name}</h2>${rows}</section>`;
}

export function renderPage(task: BusinessRequest, choice: PageChoice): string {
	const parts = [`<h1>${task.businessName}</h1>`];
	if (task.businessType === "restaurant" && task.cuisine) parts.push(`<p class="cuisine">${task.cuisine}</p>`);
	for (const name of sectionNames(task)) parts.push(sectionHtml(name, task));
	for (const link of choice.links) parts.push(`<a href="${link.href}">${link.text}</a>`);
	return parts.join("");
}
