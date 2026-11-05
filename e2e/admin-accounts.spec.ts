import { mkdirSync, readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

import { compareInventory, inventoryHtml } from "../scripts/design-inventory.mjs";
import { renderDesignMarkup } from "../scripts/render-design.mjs";
import { accessibilityViolations } from "./accessibility-helper.ts";
import {
	addCompanySuperAdmin,
	type ClerkTestUser,
	createTestUser,
	deleteTestUser,
	removeCompanyMembership,
} from "./admin-clerk.ts";
import { expect, openAdmin, test } from "./admin-db.ts";
import { expectAccounts, expectContents, measureAccounts } from "./admin-layout.ts";
import {
	expectLabeledInputs,
	expectNamedButtons,
	expectNoHorizontalScroll,
	readInventory,
	secretsFor,
	skipUnlessMacScreenshot,
	viewports,
	waitForScreenFonts,
} from "./support.ts";
import { installLocalFonts } from "./workspace.ts";

const accountHandlers = ["goAdmin", "goCatalog", "adm.onQuery", "f.pick", "r.open"];
const accountLoops = ["adm.kpis", "adm.bars", "adm.plans", "adm.filters", "adm.rows"];

let admin: ClerkTestUser | null = null;

test.beforeEach(async () => {
	const secrets = secretsFor(["secret"]);
	admin = await createTestUser(secrets.secret, { firstName: "Moe", lastName: "Ghashim" });
	await addCompanySuperAdmin(secrets.secret, admin.userId);
});

test.afterEach(async () => {
	if (!admin) return;
	const secrets = secretsFor(["secret"]);
	await removeCompanyMembership(secrets.secret, admin.userId);
	await deleteTestUser(secrets.secret, admin.userId);
	admin = null;
});

test("search by company name, owner, and email", async ({ page }) => {
	await openAdmin(page, requiredAdmin());
	const search = page.getByLabel("Search companies");
	await search.fill("Northwind");
	await expect(page.getByRole("button", { name: "Northwind Apparel" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Demo store" })).toHaveCount(0);
	await search.fill("Tom Becker");
	await expect(page.getByRole("button", { name: "Northwind Apparel" })).toBeVisible();
	await search.fill("tom@northwind.io");
	await expect(page.getByRole("button", { name: "Northwind Apparel" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Companies", exact: true })).toBeVisible();
});

test("each status filter keeps the company that matches it", async ({ page }) => {
	await openAdmin(page, requiredAdmin());
	await page.getByRole("button", { name: "Active", exact: true }).click();
	await expect(page.getByRole("button", { name: "Demo store" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Maple & Co Books" })).toHaveCount(0);
	await page.getByRole("button", { name: "Trial", exact: true }).click();
	await expect(page.getByRole("button", { name: "PixelForge Studio" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Demo store" })).toHaveCount(0);
	await page.getByRole("button", { name: "Paused", exact: true }).click();
	await expect(page.getByRole("button", { name: "Maple & Co Books" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Demo store" })).toHaveCount(0);
	await page.getByRole("button", { name: "All", exact: true }).click();
	await expect(page.getByRole("button", { name: "Demo store" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Maple & Co Books" })).toBeVisible();
});

test("a filter and a search do not change the totals", async ({ page }) => {
	await openAdmin(page, requiredAdmin());
	await expect(page.getByText("66", { exact: true })).toBeVisible();
	await expect(page.getByText("$1,294", { exact: true })).toBeVisible();
	await expect(page.getByText("4,765", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Paused", exact: true }).click();
	await page.getByLabel("Search companies").fill("maple");
	await expect(page.getByText("66", { exact: true })).toBeVisible();
	await expect(page.getByText("$1,294", { exact: true })).toBeVisible();
	await expect(page.getByText("4,765", { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Maple & Co Books" })).toBeVisible();
});

test("the week bars count created weeks and skip a week of -1", async ({ page }) => {
	await openAdmin(page, requiredAdmin());
	await expect(page.locator("[title='Week of Sep 7: 0 companies']")).toBeVisible();
	await expect(page.locator("[title='Week of Sep 28: 1 company']")).toBeVisible();
	await expect(page.locator("[title='Week of Oct 12: 1 company']")).toBeVisible();
	await expect(page.locator("[title='Week of Oct 26: 1 company']")).toBeVisible();
	await expect(page.locator("[title='Week of Sep 7: 1 company']")).toHaveCount(0);
});

test("an empty search says no companies match", async ({ page }) => {
	await openAdmin(page, requiredAdmin());
	await page.getByLabel("Search companies").fill("zzz");
	await expect(page.getByText("No companies match that search.")).toBeVisible();
	await expect(page.locator("[data-if='adm.empty']")).toBeVisible();
});

test("a row click opens that account's workspace", async ({ page }) => {
	await openAdmin(page, requiredAdmin());
	await page.getByRole("button", { name: "Northwind Apparel" }).click();
	await expect(page).toHaveURL(/\/overview$/);
	await expect(page.getByText("Runs 14 squads · Northwind Apparel")).toBeVisible();
	await expect(page.getByText("Tom Becker")).toBeVisible();
	await expect(page.getByText("Demo store")).toHaveCount(0);
	await expect(page.getByText("Did the tracking for #A-1007 go through?")).toHaveCount(0);
});

test("the accounts nav highlights Companies and has no chat dock", async ({ page }) => {
	await openAdmin(page, requiredAdmin());
	await expect(page).toHaveTitle("All accounts");
	const companies = page.getByRole("button", { name: "Companies" });
	const images = page.getByRole("button", { name: "Squad images" });
	await expect(companies).toHaveCSS("font-weight", "600");
	await expect(images).toHaveCSS("font-weight", "400");
	await expect(page.getByRole("button", { name: "Chat with Petra" })).toHaveCount(0);
	await expect(page.locator("[data-handler='send']")).toHaveCount(0);
	await expect(page.getByRole("navigation", { name: "Platform admin" })).toBeVisible();
});

test("the accounts page lists its handlers and matches the rendered design", async ({ page }) => {
	await openAdmin(page, requiredAdmin());
	const built = await sectionInventory(page, ".workspace-frame");
	expect(accountHandlers.every((name) => built.handlers.some((handler) => handler.handler === name))).toBe(true);
	for (const list of accountLoops) {
		expect(built.loops.filter((loop) => loop.list === list).length).toBeGreaterThan(0);
	}
	expect(built.loops.filter((loop) => loop.list === "adm.bars").length).toBe(2);
	const design = await designInventoryPage(page, { view: "admin" });
	const diff = compareInventory(design, built);
	expect(diff.extraHandlers).toEqual([]);
	expect(diff.missingHandlers).toEqual([]);
	expect(diff.extraLoops).toEqual([]);
	expect(diff.missingLoops).toEqual([]);
});

test("the accounts page has no axe violation and does not scroll sideways at 390", async ({ page }) => {
	await openAdmin(page, requiredAdmin());
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await expectLabeledInputs(page);
		await expectNamedButtons(page);
		expect(await accessibilityViolations(page)).toEqual([]);
		await expectNoHorizontalScroll(page);
	}
	await page.setViewportSize({ width: 390, height: 844 });
	const scroll = await page
		.locator("section")
		.filter({ hasText: "All companies" })
		.evaluate((section) => {
			const box = [...section.querySelectorAll("div")].find((node) => getComputedStyle(node).overflowX === "auto");
			if (!box) return { scroll: 0, client: 0 };
			return { scroll: box.scrollWidth, client: box.clientWidth };
		});
	expect(scroll.scroll).toBeGreaterThan(scroll.client);
});

test("the accounts boxes match the rendered design at 1440 and 390", async ({ page }) => {
	await openAdmin(page, requiredAdmin());
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await waitForScreenFonts(page);
		const designPage = await openDesign(page, { view: "admin" }, viewport.width, viewport.height);
		try {
			await expectContents(designPage, `${viewport.name} design`);
			await expectContents(page, `${viewport.name} build`);
			const design = await measureAccounts(designPage);
			const built = await measureAccounts(page);
			expectAccounts(built, design, viewport.name);
		} finally {
			await designPage.close();
		}
	}
});

test("the accounts page matches the macOS screenshot baselines", async ({ page }) => {
	skipUnlessMacScreenshot();
	await openAdmin(page, requiredAdmin());
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await waitForScreenFonts(page);
		await expect(page).toHaveScreenshot(`admin-accounts-${viewport.name}.png`, { fullPage: true });
	}
});

test("the side-by-side evidence shows the design and the build", async ({ page }) => {
	test.skip(
		process.env.ADMIN_EVIDENCE !== "1" || process.platform !== "darwin",
		"Side-by-side evidence is captured once on macOS.",
	);
	const dir = ".no-mistakes/evidence/03-admin";
	mkdirSync(dir, { recursive: true });
	await openAdmin(page, requiredAdmin());
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await waitForScreenFonts(page);
		const built = await shot(page);
		const designPage = await openDesign(page, { view: "admin" }, viewport.width, viewport.height);
		try {
			const design = await shot(designPage);
			await stitch(page, design, built, `${dir}/side-by-side-accounts-${viewport.name}.png`);
		} finally {
			await designPage.close();
		}
	}
});

function requiredAdmin() {
	if (!admin) throw new Error("The test admin is missing.");
	return admin;
}

async function sectionInventory(page: Page, selector: string) {
	const html = await page.locator(selector).evaluate((element) => element.outerHTML);
	return inventoryHtml(html);
}

async function designInventoryPage(page: Page, state: { view: string; acctQuery?: string }) {
	const canvas = await openDesign(page, state, 1440, 900);
	try {
		return await sectionInventory(canvas, "body");
	} finally {
		await canvas.close();
	}
}

async function openDesign(page: Page, state: { view: string; acctQuery?: string }, width: number, height: number) {
	const canvas = await page.context().newPage();
	await installLocalFonts(canvas);
	const fonts = readFileSync(new URL("./fonts/google-fonts.css", import.meta.url), "utf8").replace(
		/@font-face\s*\{[^}]*font-weight:\s*700;[^}]*\}/g,
		"",
	);
	await canvas.route("https://fonts.googleapis.com/css2**", (route) =>
		route.fulfill({ contentType: "text/css", body: fonts }),
	);
	await canvas.setViewportSize({ width, height });
	const body = await renderDesignMarkup(canvas, readInventory("Main"), { ...state, dockOpen: false });
	const source = readFileSync(new URL("../design/Main.dc.html", import.meta.url), "utf8");
	const css = source.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
	await canvas.setContent(
		`<!doctype html><html lang="en"><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"><style>${css}x-dc{display:contents}</style></head><body>${body}</body></html>`,
	);
	await canvas.evaluate(() => {
		for (const node of document.querySelectorAll("[data-loop], [data-if]")) {
			if (node instanceof HTMLElement) node.style.setProperty("display", "contents");
		}
	});
	await waitForScreenFonts(canvas);
	return canvas;
}

async function shot(page: Page) {
	return page.screenshot({ fullPage: true, animations: "disabled", caret: "hide", scale: "css" });
}

function pngSize(image: Buffer) {
	return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
}

async function stitch(page: Page, design: Buffer, build: Buffer, file: string) {
	const board = await page.context().newPage();
	const left = pngSize(design);
	const right = pngSize(build);
	try {
		await board.route("https://evidence.local/design.png", (route) =>
			route.fulfill({ contentType: "image/png", body: design }),
		);
		await board.route("https://evidence.local/build.png", (route) =>
			route.fulfill({ contentType: "image/png", body: build }),
		);
		await board.setViewportSize({ width: left.width + right.width, height: Math.max(left.height, right.height) });
		await board.setContent(
			'<!doctype html><html><body style="margin:0;display:flex;background:#fff"><img alt="Design" src="https://evidence.local/design.png"><img alt="Build" src="https://evidence.local/build.png"></body></html>',
		);
		await board.locator("img").nth(1).waitFor();
		await board.screenshot({ path: file, fullPage: true, animations: "disabled", caret: "hide", scale: "css" });
	} finally {
		await board.close();
	}
}
