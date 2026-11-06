import type { Page } from "@playwright/test";

import { HOME_V2_HOST } from "../apps/web/src/server/home-v2-host.ts";
import {
	expect,
	expectLabeledInputs,
	expectNamedButtons,
	expectNoHorizontalScroll,
	skipUnlessMacScreenshot,
	test,
	viewports,
	waitForHydration,
	waitForScreenFonts,
} from "./support.ts";

const localAppUrl = /^http:\/\/localhost:\d+\//;

async function routeHost(page: Page, host: string) {
	await page.unroute(localAppUrl);
	await page.route(localAppUrl, async (route) => {
		try {
			const incoming = route.request().headers();
			const cookie = incoming.cookie ?? "";
			const devCookie = cookie.includes("__clerk_db_jwt")
				? cookie
				: [cookie, "__clerk_db_jwt=dev", "__client_uat=0"].filter(Boolean).join("; ");
			const response = await route.fetch({
				headers: { ...incoming, host, cookie: devCookie },
			});
			await route.fulfill({ response });
		} catch {
			// Request context disposed when the test finishes.
		}
	});
}

test("10squads.com gets the current homepage and tensquads.moe-678.workers.dev gets home-v2", async ({ page }) => {
	await routeHost(page, "10squads.com");
	await page.goto("/");
	await expect(page).toHaveTitle("tensquads homepage");
	await expect(page.getByRole("heading", { name: "Hire a squad of AI agents to run your business" })).toBeVisible();
	await expect(page.locator(".home-v2")).toHaveCount(0);

	await routeHost(page, "www.10squads.com");
	await page.goto("/");
	await expect(page).toHaveTitle("tensquads homepage");
	await expect(page.getByRole("heading", { name: "Hire a squad of AI agents to run your business" })).toBeVisible();

	await routeHost(page, HOME_V2_HOST);
	await page.goto("/");
	await expect(page).toHaveTitle("tensquads · A team that checks its work");
	await expect(page.getByRole("heading", { name: "Your squad does the work." })).toBeVisible();
	await expect(page.locator(".home-v2")).toHaveCount(1);
});

test("hero cards have opacity 0 on the first frame with motion allowed", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "no-preference" });
	await routeHost(page, HOME_V2_HOST);
	await page.addInitScript(() => {
		const record = () => {
			const cards = Array.from(document.querySelectorAll(".home-v2 .c"));
			if (cards.length > 0 && !(window as unknown as { __firstFrameOpacities?: string[] }).__firstFrameOpacities) {
				(window as unknown as { __firstFrameOpacities?: string[] }).__firstFrameOpacities = cards.map(
					(card) => getComputedStyle(card).opacity,
				);
			}
		};
		document.addEventListener("DOMContentLoaded", record, { once: true });
		new MutationObserver(record).observe(document.documentElement, { childList: true, subtree: true });
	});
	await page.goto("/");
	const firstFrame = await page.evaluate(
		() => (window as unknown as { __firstFrameOpacities?: string[] }).__firstFrameOpacities ?? [],
	);
	expect(firstFrame).toEqual(["0", "0", "0", "0"]);
	const immediate = await page
		.locator(".home-v2 .c")
		.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).opacity));
	expect(immediate).toEqual(["0", "0", "0", "0"]);
	await expect(page.locator(".home-v2 .c").first()).toHaveClass(/\bapproved\b/, { timeout: 8000 });
	await expect(page.locator(".home-v2 .ask .sr")).toHaveText("3");
});

test("the reduced-motion path shows the hero cards at once and still approves Pisa's decision", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await routeHost(page, HOME_V2_HOST);
	await page.goto("/");
	const opacities = await page
		.locator(".home-v2 .c")
		.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).opacity));
	expect(opacities).toEqual(["1", "1", "1", "1"]);
	await expect(page.locator(".home-v2 .ask .sr")).toHaveText("4");
	await expect(page.locator(".home-v2 .c").first()).toHaveClass(/\bapproved\b/, { timeout: 3000 });
	await expect(page.locator(".home-v2 .c").first().locator(".done")).toBeVisible();
	await expect(page.locator(".home-v2 .c").first().locator(".done")).toContainText("Approved by you · in the log");
	await expect(page.locator(".home-v2 .ask .sr")).toHaveText("3");
	await expect(page.locator(".home-v2 .cnt")).toHaveClass(/\bdown\b/);
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
	test(`prompt interactions preserve animation progress with ${reducedMotion} motion`, async ({ page }) => {
		await page.emulateMedia({ reducedMotion });
		await routeHost(page, HOME_V2_HOST);
		await page.goto("/");
		const box = page.getByRole("textbox", { name: "Describe your business" });
		for (let index = 0; index < 20; index++) {
			await box.fill(`Business ${index}`);
			await page.getByRole("button", { name: index % 2 === 0 ? "New business" : "Existing business" }).click();
			await page.waitForTimeout(300);
		}
		const firstCard = page.locator(".home-v2 .c").first();
		expect(await firstCard.getAttribute("class")).toMatch(/\bapproved\b/);
		await expect(page.locator(".home-v2 .ask .sr")).toHaveText("3");
		if (reducedMotion === "no-preference") {
			for (const card of await page.locator(".home-v2 .c").all()) {
				await expect(card).toHaveClass(/\bin\b/);
			}
		}
		await expect(firstCard).toHaveClass(/\bsettled\b/, { timeout: 6000 });
		const panel = page.locator("#control .panel");
		await panel.scrollIntoViewIfNeeded();
		if (reducedMotion === "no-preference") {
			await expect(panel).toHaveClass(/\bfill\b/);
		}
		await page.getByRole("button", { name: "A cafe with a wholesale side" }).click();
		await expect(box).toHaveValue("A cafe with a wholesale side");
		await expect(panel).not.toHaveClass(/\bpre\b/);
		await page.waitForTimeout(reducedMotion === "reduce" ? 1300 : 4600);
		await expect(firstCard).not.toHaveClass(/\bpress\b/);
	});
}

test("with JavaScript off every hero card shows", async ({ browser }) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();
	try {
		await routeHost(page, HOME_V2_HOST);
		await page.goto("/", { waitUntil: "domcontentloaded" });
		const opacities = await page
			.locator(".home-v2 .c")
			.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).opacity));
		expect(opacities).toEqual(["1", "1", "1", "1"]);
	} finally {
		await context.close();
	}
});

test("no text or attribute on home-v2 contains master in any case", async ({ page }) => {
	await routeHost(page, HOME_V2_HOST);
	await page.goto("/");
	const matches = await page.locator(".home-v2").evaluate((root) => {
		const hits: string[] = [];
		const text = root.textContent ?? "";
		if (/master/i.test(text)) {
			hits.push(`text:${text}`);
		}
		for (const el of root.querySelectorAll("*")) {
			for (const attr of el.attributes) {
				if (/master/i.test(attr.value)) {
					hits.push(`${el.tagName}[${attr.name}="${attr.value}"]`);
				}
			}
		}
		return hits;
	});
	expect(matches).toEqual([]);
});

test("home-v2 toggle, example chips, squadmate tooltips, and sign-up / sign-in routes work", async ({ page }) => {
	await routeHost(page, HOME_V2_HOST);
	await page.goto("/");

	const box = page.getByRole("textbox", { name: "Describe your business" });
	await expect(box).toHaveAttribute("placeholder", "Paste your store URL or describe what you sell…");
	await expect(page.getByRole("button", { name: "A cafe with a wholesale side" })).toBeVisible();

	const initialThumb = await page.locator(".home-v2 .thumb").evaluate((el) => el.style.transform);
	await page.getByRole("button", { name: "New business" }).click();
	await expect(box).toHaveAttribute("placeholder", "Describe what you want to sell and to whom…");
	await expect(page.getByRole("button", { name: "Handmade ceramics on Etsy" })).toBeVisible();
	const nextThumb = await page.locator(".home-v2 .thumb").evaluate((el) => el.style.transform);
	expect(nextThumb).not.toBe(initialThumb);

	await page.getByRole("button", { name: "Handmade ceramics on Etsy" }).click();
	await expect(box).toHaveValue("Handmade ceramics on Etsy");

	// Squadmate shows details on hover and keyboard focus.
	const firstMate = page.locator(".home-v2 .mates .m").first();
	const firstTip = firstMate.locator("#tip-orders");
	await expect(firstTip).toHaveCSS("visibility", "hidden");
	await firstMate.focus();
	await expect(firstTip).toHaveCSS("visibility", "visible");
	await page.locator("#draft").focus();
	await expect(firstTip).toHaveCSS("visibility", "hidden");
	await firstMate.hover();
	await expect(firstTip).toHaveCSS("visibility", "visible");

	// Limit sliders fill when the panel comes into view.
	await page.locator("#control .panel").scrollIntoViewIfNeeded();
	await expect(page.locator("#control .panel")).toHaveClass(/\bfill\b/);

	// Routes
	await page.locator("nav").getByRole("link", { name: "Sign in" }).click();
	await expect(page).toHaveURL(/\/signin$/);

	await page.goto("/");
	await page.locator("nav").getByRole("link", { name: "Start free" }).click();
	await expect(page).toHaveURL(/\/signup$/);

	await page.goto("/");
	await page.getByRole("button", { name: "Build my squad →" }).click();
	await expect(page).toHaveURL(/\/signup(\?|$)/);
});

test("home-v2 controls are keyboard-reachable with the 2px #0169cc focus ring", async ({ page }) => {
	await routeHost(page, HOME_V2_HOST);
	await page.goto("/");
	await expectLabeledInputs(page);
	await expectNamedButtons(page);
	await page.keyboard.press("Tab");
	const style = await page.evaluate(() => {
		const cs = getComputedStyle(document.activeElement as Element);
		return { outline: cs.outline, outlineOffset: cs.outlineOffset };
	});
	expect(style.outline).toContain("rgb(1, 105, 204)");
	expect(style.outline).toContain("2px");
	expect(style.outlineOffset).toBe("2px");
});

for (const viewport of viewports) {
	test(`home-v2 at ${viewport.name}`, async ({ page }) => {
		skipUnlessMacScreenshot();
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await routeHost(page, HOME_V2_HOST);
		await page.goto("/");
		await waitForScreenFonts(page);
		await waitForHydration(page);
		await expect(page.locator(".home-v2 .c").first()).toHaveClass(/\bsettled\b/, { timeout: 10000 });
		await page.evaluate(async () => {
			for (const img of Array.from(document.images)) {
				if (!img.complete) {
					await new Promise((resolve) => {
						img.addEventListener("load", resolve, { once: true });
						img.addEventListener("error", resolve, { once: true });
					});
				}
			}
			await document.fonts.ready;
		});
		await expectNoHorizontalScroll(page);
		await expect(page).toHaveScreenshot(`home-v2-${viewport.name}.png`, { fullPage: true });
	});
}
