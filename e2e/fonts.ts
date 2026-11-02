import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

const fontStylesheetUrl =
	"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";
const fontStylesheet = readFileSync(new URL("./fonts/google-fonts.css", import.meta.url), "utf8");
const fontFiles = new Map(
	[...fontStylesheet.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(([, url]) => [
		url,
		readFileSync(new URL(`./fonts/${new URL(url).pathname.split("/").at(-1)}`, import.meta.url)),
	]),
);

export function pinnedFontStylesheet(requestUrl: string): string {
	const families = new URL(requestUrl).searchParams.getAll("family");
	if (families.length === 0) return fontStylesheet;
	const requested = requestedWeights(families);
	return fontStylesheet
		.split(/\n(?=\/\*)/)
		.filter((block) => blockIsRequested(block, requested))
		.join("\n");
}

function requestedWeights(families: readonly string[]): Map<string, Set<string>> {
	const requested = new Map<string, Set<string>>();
	for (const family of families) {
		const mark = family.indexOf(":wght@");
		const name = (mark === -1 ? family : family.slice(0, mark)).trim();
		const weights = mark === -1 ? [] : family.slice(mark + ":wght@".length).split(";");
		const set = requested.get(name) ?? new Set<string>();
		for (const weight of weights) {
			if (weight.length > 0) set.add(weight);
		}
		requested.set(name, set);
	}
	return requested;
}

function blockIsRequested(block: string, requested: ReadonlyMap<string, Set<string>>): boolean {
	const family = block.match(/font-family:\s*'([^']+)'/)?.[1];
	const weight = block.match(/font-weight:\s*(\d+)/)?.[1];
	if (!family || !weight) return false;
	return requested.get(family)?.has(weight) ?? false;
}

export async function installPinnedFonts(page: Page, workspace = false) {
	await page.route(fontStylesheetUrl, (route) => route.fulfill({ contentType: "text/css", body: fontStylesheet }));
	if (workspace) {
		await page.route("https://fonts.googleapis.com/css2**", (route) =>
			route.fulfill({ contentType: "text/css", body: fontStylesheet }),
		);
	}
	await page.route("https://fonts.gstatic.com/**", (route) => {
		const body = fontFiles.get(route.request().url());
		if (!body) {
			throw new Error(workspace ? "Unpinned font request." : `Unpinned font request: ${route.request().url()}`);
		}
		return route.fulfill({
			contentType: "font/woff2",
			headers: { "access-control-allow-origin": "*" },
			body,
		});
	});
}
