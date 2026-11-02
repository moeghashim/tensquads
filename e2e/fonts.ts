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
