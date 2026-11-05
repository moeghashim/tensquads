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
import { expectContents, expectImages, measureImages } from "./admin-layout.ts";
import { agentNames, rewriteBuiltInventory } from "./squadmate-copy.ts";
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

const imageHandlers = ["goAdmin", "goCatalog", "f.pick", "r.pick"];
const imageLoops = ["cat.kpis", "cat.filters", "cat.rows", "img.bugs", "img.features"];

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

test("each image filter shows the matching rows", async ({ page }) => {
	await openImages(page);
	await expect(page.getByRole("heading", { name: "All images" })).toContainText("7 of 7");
	await page.getByRole("button", { name: "Needs attention", exact: true }).click();
	await expect(page.getByRole("button", { name: "Kyoto" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Rio" })).toHaveCount(0);
	await page.getByRole("button", { name: "With bugs", exact: true }).click();
	await expect(page.getByRole("button", { name: "Kyoto" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Rio" })).toHaveCount(0);
	await page.getByRole("button", { name: "With requests", exact: true }).click();
	await expect(page.getByRole("button", { name: "Rio" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "All images" })).toContainText("7 of 7");
	await page.getByRole("button", { name: "All", exact: true }).click();
	await expect(page.getByRole("heading", { name: "All images" })).toContainText("7 of 7");
});

test("a row click fills the detail panel", async ({ page }) => {
	await openImages(page);
	await expect(page.getByRole("heading", { name: "Kyoto" })).toBeVisible();
	await expect(page.getByRole("img", { name: "Kyoto, Support" })).toBeVisible();
	await expect(page.getByText("22 of 34 (65%)")).toBeVisible();
	await page.getByRole("button", { name: "Sydney" }).click();
	await expect(page.getByRole("heading", { name: "Sydney" })).toBeVisible();
	await expect(page.getByText("Not deployed yet")).toBeVisible();
	await page.getByRole("button", { name: "Rio" }).click();
	await expect(page.getByRole("heading", { name: "Rio" })).toBeVisible();
	await expect(page.getByText("No open bugs on this version.")).toBeVisible();
	await page.getByRole("button", { name: "Needs attention", exact: true }).click();
	await expect(page.getByRole("button", { name: "Rio" })).toHaveCount(0);
	await expect(page.getByRole("heading", { name: "Rio" })).toBeVisible();
	await expect(page.getByText("No open bugs on this version.")).toBeVisible();
});

test("the sidebar badge shows 2", async ({ page }) => {
	await openImages(page);
	await expect(page.getByRole("button", { name: "Squad images" })).toContainText("2");
	await expect(page.getByText("2 images need attention")).toBeVisible();
});

test("roll out and view changelog change nothing", async ({ page }) => {
	await openImages(page);
	const before = await page.getByRole("complementary", { name: "Image details" }).textContent();
	await page.getByRole("button", { name: "Roll out 2.1.1" }).click();
	await page.getByRole("button", { name: "View changelog" }).click();
	await expect(page).toHaveURL(/\/admin\/images$/);
	expect(await page.getByRole("complementary", { name: "Image details" }).textContent()).toBe(before);
	await expect(page.locator("[data-handler='rollOut']")).toHaveCount(0);
});

test("the images nav highlights Squad images and has no chat dock", async ({ page }) => {
	await openImages(page);
	await expect(page).toHaveTitle("Agent images");
	await expect(page.getByRole("button", { name: "Squad images" })).toHaveCSS("font-weight", "600");
	await expect(page.getByRole("button", { name: "Companies" })).toHaveCSS("font-weight", "400");
	await expect(page.getByRole("button", { name: "Chat with Petra" })).toHaveCount(0);
	await expect(page.locator("[data-handler='send']")).toHaveCount(0);
});

test("the images page lists its handlers and matches the rendered design", async ({ page }) => {
	await openImages(page);
	const built = await sectionInventory(page, ".workspace-frame");
	expect(imageHandlers.every((name) => built.handlers.some((handler) => handler.handler === name))).toBe(true);
	for (const list of imageLoops) {
		expect(built.loops.filter((loop) => loop.list === list).length).toBeGreaterThan(0);
	}
	expect(built.loops.some((loop) => loop.kind === "if" && loop.value === "img.noBugs")).toBe(false);
	const design = await designFrame(page);
	const diff = compareInventory(rewriteBuiltInventory(design, agentNames), built);
	expect(diff.extraHandlers).toEqual([]);
	expect(diff.missingHandlers).toEqual([]);
	expect(diff.extraLoops).toEqual([]);
	expect(diff.missingLoops).toEqual([]);
});

test("the source still has the empty feature request", async () => {
	const source = readFileSync(new URL("../apps/web/src/screens/admin/images.tsx", import.meta.url), "utf8");
	expect(source).toContain('data-if="img.noFeatures"');
	expect(source).toContain("Nothing requested yet.");
});

test("the images page has no axe violation and does not scroll sideways at 390", async ({ page }) => {
	await openImages(page);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await expectLabeledInputs(page);
		await expectNamedButtons(page);
		expect(await accessibilityViolations(page)).toEqual([]);
		await expectNoHorizontalScroll(page);
	}
	await page.setViewportSize({ width: 390, height: 844 });
	const scroll = await page.locator("section[aria-label='Images']").evaluate((section) => {
		const box = [...section.querySelectorAll("div")].find((node) => getComputedStyle(node).overflowX === "auto");
		if (!box) return { scroll: 0, client: 0 };
		return { scroll: box.scrollWidth, client: box.clientWidth };
	});
	expect(scroll.scroll).toBeGreaterThan(scroll.client);
});

test("the images boxes match the rendered design at 1440 and 390", async ({ page }) => {
	await openImages(page);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await waitForScreenFonts(page);
		const designPage = await openCatalogCanvas(page, viewport.width, viewport.height);
		try {
			await expectContents(designPage, `${viewport.name} design`);
			await expectContents(page, `${viewport.name} build`);
			const design = await measureImages(designPage);
			const built = await measureImages(page);
			expectImages(built, design, viewport.name);
		} finally {
			await designPage.close();
		}
	}
});

test("the images page matches the macOS screenshot baselines", async ({ page }) => {
	skipUnlessMacScreenshot();
	await openImages(page);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await waitForScreenFonts(page);
		await expect(page).toHaveScreenshot(`admin-images-${viewport.name}.png`, { fullPage: true });
	}
});

test("the side-by-side evidence shows the design and the build", async ({ page }) => {
	test.skip(
		process.env.ADMIN_EVIDENCE !== "1" || process.platform !== "darwin",
		"Side-by-side evidence is captured once on macOS.",
	);
	const dir = ".no-mistakes/evidence/03-admin";
	mkdirSync(dir, { recursive: true });
	await openImages(page);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await waitForScreenFonts(page);
		const built = await shot(page);
		const designPage = await openCatalogCanvas(page, viewport.width, viewport.height);
		try {
			const design = await shot(designPage);
			await stitch(page, design, built, `${dir}/side-by-side-images-${viewport.name}.png`);
		} finally {
			await designPage.close();
		}
	}
});

async function openImages(page: Page) {
	if (!admin) throw new Error("The test admin is missing.");
	await openAdmin(page, admin);
	await page.getByRole("button", { name: "Squad images" }).click();
	await expect(page).toHaveURL(/\/admin\/images$/);
	await expect(page.getByRole("heading", { name: "Squad images" })).toBeVisible();
}

async function sectionInventory(page: Page, selector: string) {
	const html = await page.locator(selector).evaluate((element) => element.outerHTML);
	return inventoryHtml(html);
}

async function designFrame(page: Page) {
	const canvas = await openCatalogCanvas(page, 1440, 900);
	try {
		return await sectionInventory(canvas, "body");
	} finally {
		await canvas.close();
	}
}

async function openCatalogCanvas(page: Page, width: number, height: number) {
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
	const body = await renderDesignMarkup(canvas, readInventory("Main"), { view: "catalog", dockOpen: false });
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
