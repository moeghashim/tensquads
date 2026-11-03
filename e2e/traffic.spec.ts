import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { openPostgres, schema } from "@tensquads/adapters";
import { and, asc, eq } from "drizzle-orm";
import { compareInventory, inventoryHtml } from "../scripts/design-inventory.mjs";
import { renderDesignMarkup } from "../scripts/render-design.mjs";
import {
	expectLabeledInputs,
	expectNamedButtons,
	expectNoHorizontalScroll,
	readInventory,
	secretsFor,
	skipUnlessMacScreenshot,
	waitForScreenFonts,
} from "./support.ts";
import { expect, generatedEvents, installLocalFonts, openWorkspace, test } from "./workspace.ts";

const boards = [
	{ name: "1440", width: 1440, height: 1500 },
	{ name: "390", width: 390, height: 1500 },
] as const;

const sweatshirt = "Sweatshirt shipped, tracking added. Print still in production.";
const daily = "Daily stock check";
const stockText = "2 products under 10: Black hoodie M (6), A3 frame (8)";
const stockValue = '["Black hoodie M","A3 frame"]';
const fulfilment = "Fulfilment time −0.3 days (Orders)";
const noDelta = "None. Only Result events carry a delta.";
const refund = "Refund $42 on #A-1012 is under the limit but the customer is flagged";
const financeText = "Last 7 days: $8,420 revenue, $2,610 profit";

test("traffic shows the hub, the chips, the list, the inspector, the state table and both controls", async ({
	page,
	workspaceUser,
}) => {
	await openTraffic(page, workspaceUser);
	await expect(page).toHaveTitle("Agent traffic");
	await expect(page.getByRole("heading", { name: "Squad traffic", level: 1 })).toBeVisible();
	await expect(page.getByRole("region", { name: "How messaging works" })).toBeVisible();
	await expect(page.getByRole("region", { name: "Squad map" })).toBeVisible();
	await expect(page.getByRole("region", { name: "Message log" })).toBeVisible();
	await expect(page.getByRole("complementary", { name: "Message details" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Shared state held by Master" })).toBeVisible();
	await expect(
		page.locator("[data-loop='filters']").getByRole("button", { name: "All agents", exact: true }),
	).toBeVisible();
	await expect(page.locator("[data-loop='busView']").getByText(sweatshirt)).toBeVisible();
	await expect(page.getByText("policy.refund_auto_limit")).toBeVisible();
	await expect(page.getByRole("button", { name: "Paused", exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Send next event" })).toBeVisible();
	await expectNamedButtons(page);
	await expectLabeledInputs(page);
});

test("a hub click filters the list to that agent", async ({ page, workspaceUser }) => {
	await openTraffic(page, workspaceUser);
	const details = page.getByRole("complementary", { name: "Message details" });
	await expect(details.getByText(sweatshirt)).toBeVisible();
	await page.getByRole("region", { name: "Squad map" }).getByRole("button", { name: "Inventory" }).click();
	await expect(page.locator("[data-loop='busView']").getByText(sweatshirt)).toHaveCount(0);
	await expect(details.getByText(sweatshirt)).toBeVisible();
	// The seeded bus has no Inventory event, so this filter hides every row.
	await expect(page.locator("[data-loop='busView'] button")).toHaveCount(0);
});

test("a second hub click clears the filter", async ({ page, workspaceUser }) => {
	await openTraffic(page, workspaceUser);
	const hub = page.getByRole("region", { name: "Squad map" }).getByRole("button", { name: "Inventory" });
	await hub.click();
	await expect(page.locator("[data-loop='busView']").getByText(sweatshirt)).toHaveCount(0);
	await hub.click();
	await expect(page.locator("[data-loop='busView']").getByText(sweatshirt)).toBeVisible();
});

test("an event click fills the inspector", async ({ page, workspaceUser }) => {
	await openTraffic(page, workspaceUser);
	await page.locator("[data-loop='busView']").getByText(financeText).click();
	const details = page.getByRole("complementary", { name: "Message details" });
	await expect(details.getByText("Finance → Master")).toBeVisible();
	await expect(details.locator("dd", { hasText: /^quickbooks\.pnl$/ })).toBeVisible();
	await expect(details.locator("dd", { hasText: /^tr_faa0ac$/ })).toBeVisible();
	await expect(
		details.locator("[data-loop='ins.writes']").getByText("finance.revenue_7d", { exact: true }),
	).toBeVisible();
	await expect(details.locator("pre")).toContainText('"revenue": 8420');
});

test("live adds one event every 3.5 seconds, on any page, until paused", async ({ page, workspaceUser, accountId }) => {
	test.setTimeout(180_000);
	const errors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	page.on("pageerror", (error) => errors.push(error.message));
	await openWorkspace(page, workspaceUser);
	await page.clock.install();
	await page.reload();
	await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible({ timeout: 20_000 });
	await page.goto("/traffic");
	await page.getByRole("button", { name: "Paused", exact: true }).click();
	await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Overview" }).click();
	await expect(page).toHaveURL(/\/overview$/);
	await page.clock.fastForward(3500);
	await expect.poll(async () => (await generatedEvents(accountId)).length, { timeout: 20_000 }).toBe(1);
	await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Squad traffic" }).click();
	await expect(page).toHaveURL(/\/traffic$/);
	await expect(page.getByRole("complementary", { name: "Message details" })).toContainText(daily);
	await page.getByRole("button", { name: "Live", exact: true }).click();
	const posts = { count: 0 };
	const onRequest = (request: { method: () => string; headers: () => Record<string, string> }) => {
		if (request.method() === "POST" && request.headers()["x-tsr-serverfn"] === "true") posts.count += 1;
	};
	page.on("request", onRequest);
	const beforePosts = posts.count;
	const beforeEvents = (await generatedEvents(accountId)).length;
	await page.clock.fastForward(3500);
	await new Promise((resolve) => setTimeout(resolve, 300));
	expect(posts.count).toBe(beforePosts);
	expect((await generatedEvents(accountId)).length).toBe(beforeEvents);
	page.off("request", onRequest);
	expect(errors).toEqual([]);
});

test("send next event adds the event, selects it and updates the state table", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	test.setTimeout(180_000);
	const errors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	page.on("pageerror", (error) => errors.push(error.message));
	await openTraffic(page, workspaceUser);
	await waitForSendHandler(page);
	await page.getByRole("button", { name: "Send next event" }).click();
	await expect(page.locator("[data-event-id='e100']")).toContainText(daily);
	await expect(page.getByRole("complementary", { name: "Message details" })).toContainText(daily);
	await setStock(accountId, "before-write");
	await page.reload();
	await expect(page.getByText("before-write")).toBeVisible();
	await waitForSendHandler(page);
	await page.getByRole("button", { name: "Send next event" }).click();
	await expect(page.locator("[data-event-id='e101']")).toContainText(stockText, { timeout: 20_000 });
	await expect(page.getByRole("complementary", { name: "Message details" })).toContainText(stockText);
	await expect(page.getByText(stockValue)).toBeVisible();
	await expect(page.getByText("before-write")).toHaveCount(0);
	expect(errors).toEqual([]);
});

test("a filter chip filters the list and All agents clears it", async ({ page, workspaceUser }) => {
	await openTraffic(page, workspaceUser);
	const chips = page.locator("[data-loop='filters']");
	await chips.getByRole("button", { name: "Orders", exact: true }).click();
	await expect(page.locator("[data-loop='busView']").getByText(financeText)).toHaveCount(0);
	await expect(page.locator("[data-loop='busView']").getByText(sweatshirt)).toBeVisible();
	await chips.getByRole("button", { name: "All agents", exact: true }).click();
	await expect(page.locator("[data-loop='busView']").getByText(financeText)).toBeVisible();
});

test("a Result shows its mission delta and other kinds show None", async ({ page, workspaceUser }) => {
	await openTraffic(page, workspaceUser);
	const details = page.getByRole("complementary", { name: "Message details" });
	await expect(details.getByText(fulfilment)).toBeVisible();
	await expect(details.getByText(fulfilment)).toHaveCSS("color", "rgb(0, 105, 42)");
	await page.locator("[data-loop='busView']").getByText(refund).click();
	await expect(details.getByText(noDelta)).toBeVisible();
	await expect(details.getByText(noDelta)).toHaveCSS("color", "rgb(93, 93, 93)");
});

test("the script starts again after eight events with new ids", async ({ page, workspaceUser, accountId }) => {
	test.setTimeout(180_000);
	await openTraffic(page, workspaceUser);
	for (let step = 0; step < 9; step += 1) {
		await page.getByRole("button", { name: "Send next event" }).click();
		// The row is on screen only after the refresh, which is when the guard clears.
		await expect(page.locator(`[data-event-id='e${100 + step}']`)).toBeVisible({ timeout: 20_000 });
	}
	const rows = await generatedEvents(accountId);
	expect(rows[0]?.id).toBe("e100");
	expect(rows[8]?.id).toBe("e108");
	expect(rows[8]?.body).toBe(daily);
	await expect(page.locator("[data-event-id='e108']")).toContainText(daily);
	await expect(page.locator("[data-event-id='e100']")).toContainText(daily);
	await expect(page.getByRole("complementary", { name: "Message details" })).toContainText(daily);
});

test("an empty bus shows blank inspector values and None", async ({ page, workspaceUser, accountId }) => {
	await openTraffic(page, workspaceUser);
	await deleteEvents(accountId);
	await page.reload();
	await expect(page.locator("[data-loop='busView'] button")).toHaveCount(0);
	await expect(page.locator("[data-loop='filters'] button").first()).toBeVisible();
	const details = page.getByRole("complementary", { name: "Message details" });
	await expect(
		details.locator("dt", { hasText: "Mission delta" }).locator("xpath=following-sibling::dd[1]"),
	).toHaveText("None");
	await expect(details.locator("pre")).toHaveText("");
	await expect(details.getByRole("heading", { name: "Message" }).locator("xpath=..").locator("span")).toHaveCount(0);
	await expect(page.getByRole("heading", { name: "Shared state held by Master" })).toBeVisible();
	await expect(page.getByText("policy.refund_auto_limit")).toBeVisible();
});

test("the list follows sequence order", async ({ page, workspaceUser, accountId }) => {
	await openTraffic(page, workspaceUser);
	const ids = await eventIds(accountId);
	const shown = await page.locator("[data-event-id]").evaluateAll((elements) => {
		return elements.map((element) => element.getAttribute("data-event-id"));
	});
	expect(shown).toEqual([...ids].reverse());
	expect(ids.indexOf("e1043supportmaster")).toBeLessThan(ids.indexOf("e1043masterorders"));
});

test("the Inventory hub node is dimmed", async ({ page, workspaceUser }) => {
	await openTraffic(page, workspaceUser);
	const hub = page.getByRole("region", { name: "Squad map" });
	await expect(hub.getByRole("button", { name: "Inventory" })).toHaveCSS("opacity", "0.6");
	const opacities = await hub.getByRole("button").evaluateAll((elements) => {
		return elements.map((element) => getComputedStyle(element).opacity);
	});
	expect(opacities).toContain("1");
});

test("the traffic boxes match the rendered design at 1440 and 390", async ({ page, workspaceUser }) => {
	await openTraffic(page, workspaceUser);
	for (const board of boards) {
		await page.setViewportSize({ width: board.width, height: board.height });
		await waitForScreenFonts(page);
		const designPage = await openDesignTraffic(page, board.width, board.height);
		try {
			await waitForScreenFonts(designPage);
			const design = await measureTraffic(designPage);
			const built = await measureTraffic(page);
			expectKnownBoxes(built, board.name);
			expectKnownBoxes(design, `${board.name} design`);
			expectNear(built.listWidth, design.listWidth, `${board.name} list width`);
			expectNear(built.listX, design.listX, `${board.name} list x`);
			expectNear(built.inspectorX, design.inspectorX, `${board.name} inspector x`);
		} finally {
			await designPage.close();
		}
	}
});

test("the traffic inventory matches the flow view", async ({ page, workspaceUser }) => {
	await openTraffic(page, workspaceUser);
	const design = await designInventory(page);
	const built = await flowInventory(page);
	const diff = compareInventory(design, built);
	expect(diff.extraTexts).toEqual([]);
	expect(diff.missingTexts).toEqual([]);
	expect(diff.extraHandlers).toEqual([]);
	expect(diff.missingHandlers).toEqual([]);
	expect(diff.extraLoops).toEqual([]);
	expect(diff.missingLoops).toEqual([]);
	expect(diff.extraLinks).toEqual([]);
	expect(diff.missingLinks).toEqual([]);
	expect(identities(built.handlers)).toEqual(identities(design.handlers));
	const mutated = compareInventory(design, {
		...built,
		texts: ["NOT IN THE DESIGN", ...built.texts.slice(1)],
	});
	expect(mutated.extraTexts).toContain("NOT IN THE DESIGN");
	expect(mutated.missingTexts.length).toBeGreaterThan(0);
});

test("the keyboard reaches every traffic button and shows the focus ring", async ({ page, workspaceUser }) => {
	await openTraffic(page, workspaceUser);
	const total = await page.locator("button").count();
	const seen = new Set<number>();
	let ring: { width: string; offset: string; color: string } | null = null;
	for (let step = 0; step < total + 5; step += 1) {
		await page.keyboard.press("Tab");
		const hit = await page.evaluate(() => {
			const current = document.activeElement;
			const flow = document.querySelector("[data-if='isFlow']");
			if (!(current instanceof HTMLButtonElement) || !flow?.contains(current)) return null;
			const buttons = [...flow.querySelectorAll("button")];
			const style = getComputedStyle(current);
			return {
				index: buttons.indexOf(current),
				width: style.outlineWidth,
				offset: style.outlineOffset,
				color: style.outlineColor,
			};
		});
		if (!hit || hit.index < 0) continue;
		seen.add(hit.index);
		ring ??= { width: hit.width, offset: hit.offset, color: hit.color };
	}
	const trafficCount = await page.locator("[data-if='isFlow'] button").count();
	expect(trafficCount).toBeGreaterThan(0);
	expect(seen.size).toBe(trafficCount);
	expect(ring).toEqual({ width: "2px", offset: "2px", color: "rgb(1, 105, 204)" });
});

test("the traffic page has no horizontal scroll at 390", async ({ page, workspaceUser }) => {
	await openTraffic(page, workspaceUser);
	await page.setViewportSize({ width: 390, height: 1500 });
	await expectNoHorizontalScroll(page);
	const wide = await page.locator("[data-loop='busView']").evaluate((element) => {
		const scroller = element.parentElement?.parentElement;
		if (!scroller) return 0;
		return scroller.scrollWidth;
	});
	expect(wide).toBeGreaterThanOrEqual(520);
});

test("the traffic page passes axe", async ({ page, workspaceUser }) => {
	await openTraffic(page, workspaceUser);
	for (const board of boards) {
		await page.setViewportSize({ width: board.width, height: board.height });
		await waitForScreenFonts(page);
		expect(await trafficViolations(page)).toEqual([]);
	}
});

test("a hung send clears and the next click adds the event", async ({ page, workspaceUser, accountId }) => {
	test.setTimeout(180_000);
	await openWorkspace(page, workspaceUser);
	await page.clock.install();
	await page.reload();
	await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible({ timeout: 20_000 });
	await page.goto("/traffic");
	let release: (() => void) | undefined;
	await page.route("**/*", async (route) => {
		const request = route.request();
		const advance = request.method() === "POST" && request.headers()["x-tsr-serverfn"] === "true";
		if (advance && release === undefined) {
			await new Promise<void>((resolve) => {
				release = resolve;
			});
			await route.abort().catch(() => undefined);
			return;
		}
		await route.continue();
	});
	try {
		await page.getByRole("button", { name: "Send next event" }).click();
		await expect.poll(() => release !== undefined).toBe(true);
		await page.clock.fastForward(30_100);
		// The fake clock does not advance this wait. The aborted send refreshes before the guard clears.
		await new Promise((resolve) => setTimeout(resolve, 1000));
		await page.getByRole("button", { name: "Send next event" }).click();
		await expect.poll(async () => (await generatedEvents(accountId)).length, { timeout: 20_000 }).toBe(1);
	} finally {
		release?.();
		await page.unrouteAll({ behavior: "ignoreErrors" });
	}
});

test("the traffic matches the macOS screenshot baselines", async ({ page, workspaceUser }) => {
	skipUnlessMacScreenshot();
	await openTraffic(page, workspaceUser);
	for (const board of boards) {
		await page.setViewportSize({ width: board.width, height: board.height });
		await waitForScreenFonts(page);
		await maskTraces(page);
		await expect(page).toHaveScreenshot(`traffic-${board.name}.png`, {
			fullPage: true,
			mask: [page.locator("[data-mask='trace']")],
		});
	}
});

test("the side-by-side evidence shows the design and the build", async ({ page, workspaceUser }) => {
	test.skip(
		process.env.TRAFFIC_EVIDENCE !== "1" || process.platform !== "darwin",
		"Side-by-side evidence is captured once on macOS.",
	);
	await openTraffic(page, workspaceUser);
	for (const board of boards) {
		await page.setViewportSize({ width: board.width, height: board.height });
		await waitForScreenFonts(page);
		await maskTraces(page);
		const built = await shot(page);
		const designPage = await openDesignTraffic(page, board.width, board.height);
		try {
			await waitForScreenFonts(designPage);
			await maskTraces(designPage);
			const design = await shot(designPage);
			const file = fileURLToPath(
				new URL(`../.no-mistakes/evidence/02-traffic/side-by-side-${board.name}.png`, import.meta.url),
			);
			mkdirSync(fileURLToPath(new URL("../.no-mistakes/evidence/02-traffic/", import.meta.url)), {
				recursive: true,
			});
			await stitch(page, design, built, file);
		} finally {
			await designPage.close();
		}
	}
});

// The design pre scrolls and is not a tab stop. The off Inventory node is opacity 0.6, so its text falls under 4.5:1.
async function trafficViolations(page: Page) {
	const skipped = ["color-contrast", "scrollable-region-focusable"];
	const full = await new AxeBuilder({ page }).disableRules(skipped).analyze();
	const scroll = await new AxeBuilder({ page })
		.withRules(["scrollable-region-focusable"])
		.exclude("aside[aria-label='Message details'] pre")
		.analyze();
	const contrast = await new AxeBuilder({ page })
		.withRules(["color-contrast"])
		.exclude("section[aria-label='Squad map'] button[style*='#f3f3f3']")
		.analyze();
	return [...full.violations, ...scroll.violations, ...contrast.violations];
}

async function waitForSendHandler(page: Page) {
	await page.waitForFunction(() => {
		const button = document.querySelector("[data-handler='simulate']");
		return Boolean(button && Object.keys(button).some((key) => key.startsWith("__reactProps")));
	});
}

async function openTraffic(page: Page, user: { email: string; password: string; userId: string; accountId: string }) {
	await openWorkspace(page, user);
	await page.goto("/traffic");
	await expect(page.getByRole("heading", { name: "Squad traffic", level: 1 })).toBeVisible();
}

async function setStock(accountId: string, value: string) {
	const secrets = secretsFor(["testDatabase"]);
	const postgres = openPostgres(secrets.testDatabase);
	try {
		await postgres.db
			.update(schema.stateEntries)
			.set({ value: JSON.stringify(value) })
			.where(and(eq(schema.stateEntries.accountId, accountId), eq(schema.stateEntries.key, "inventory.low_stock")));
	} finally {
		await postgres.close();
	}
}

async function deleteEvents(accountId: string) {
	const secrets = secretsFor(["testDatabase"]);
	const postgres = openPostgres(secrets.testDatabase);
	try {
		await postgres.db.delete(schema.busEvents).where(eq(schema.busEvents.accountId, accountId));
	} finally {
		await postgres.close();
	}
}

async function eventIds(accountId: string) {
	const secrets = secretsFor(["testDatabase"]);
	const postgres = openPostgres(secrets.testDatabase);
	try {
		const rows = await postgres.db
			.select()
			.from(schema.busEvents)
			.where(eq(schema.busEvents.accountId, accountId))
			.orderBy(asc(schema.busEvents.seq));
		return rows.map((row) => row.id);
	} finally {
		await postgres.close();
	}
}

function prepareInventory(html: string) {
	return html.replace(/>\s+</g, "><").replace(/tr_[a-z0-9]+/g, "tr_masked");
}

async function flowInventory(page: Page) {
	const html = await page.locator("[data-if='isFlow']").evaluate((element) => element.outerHTML);
	return inventoryHtml(prepareInventory(html));
}

async function designInventory(page: Page) {
	const canvas = await page.context().newPage();
	try {
		const html = await renderDesignMarkup(canvas, readInventory("Main"), { view: "flow" });
		await canvas.setContent(html);
		return await flowInventory(canvas);
	} finally {
		await canvas.close();
	}
}

function identities(handlers: { tag: string; event: string; handler: string }[]) {
	return handlers.map((handler) => `${handler.tag}|${handler.event}|${handler.handler}`).sort();
}

async function openDesignTraffic(page: Page, width: number, height: number) {
	const canvas = await page.context().newPage();
	await installLocalFonts(canvas);
	await canvas.setViewportSize({ width, height });
	const body = await renderDesignMarkup(canvas, readInventory("Main"), { view: "flow" });
	const source = readFileSync(new URL("../design/Main.dc.html", import.meta.url), "utf8");
	const css = source.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
	await canvas.setContent(
		`<!doctype html><html lang="en"><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"><style>${css}x-dc{display:contents}</style></head><body>${body}</body></html>`,
	);
	await canvas.evaluate(() => {
		for (const node of document.querySelectorAll("[data-loop], [data-if]")) {
			if (node instanceof HTMLElement) node.style.setProperty("display", "contents");
		}
	});
	await waitForScreenFonts(canvas);
	return canvas;
}

async function maskTraces(page: Page) {
	await page.evaluate(() => {
		for (const term of document.querySelectorAll("dt")) {
			if ((term.textContent ?? "").replace(/\s+/g, " ").trim() !== "Trace") continue;
			const value = term.nextElementSibling;
			if (value instanceof HTMLElement) value.dataset.mask = "trace";
		}
		const pre = document.querySelector("aside[aria-label='Message details'] pre");
		if (!(pre instanceof HTMLElement)) return;
		const textNode = [...pre.childNodes].find(
			(node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes("trace_id"),
		);
		if (!textNode?.textContent) return;
		const source = textNode.textContent;
		const start = source.indexOf('"trace_id"');
		if (start < 0) return;
		const end = source.indexOf("\n", start);
		const range = document.createRange();
		range.setStart(textNode, start);
		range.setEnd(textNode, end === -1 ? source.length : end);
		const rect = range.getBoundingClientRect();
		const host = pre.getBoundingClientRect();
		pre.style.position = "relative";
		const cover = document.createElement("div");
		cover.dataset.mask = "trace";
		cover.style.position = "absolute";
		cover.style.left = `${rect.x - host.x}px`;
		cover.style.top = `${rect.y - host.y + pre.scrollTop}px`;
		cover.style.width = `${Math.max(rect.width, 8)}px`;
		cover.style.height = `${Math.max(rect.height, 8)}px`;
		cover.style.background = "#181818";
		pre.append(cover);
	});
}

type TrafficBoxes = Awaited<ReturnType<typeof measureTraffic>>;

function expectNear(actual: number, expected: number, label: string) {
	expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(0.5);
}

function expectKnownBoxes(boxes: TrafficBoxes, name: string) {
	expectNear(boxes.columnGap, 20, `${name} column gap`);
	expectNear(boxes.rulesGap, 12, `${name} rules gap`);
	expectNear(boxes.stemWidth, 1, `${name} stem width`);
	expectNear(boxes.stemHeight, 20, `${name} stem height`);
	expectNear(boxes.barHeight, 1, `${name} bar height`);
	expectNear(boxes.barWidth, boxes.hubContent * 0.8, `${name} bar width`);
	expectNear(boxes.eventGap, 10, `${name} event gap`);
	expectNear(boxes.timeWidth, 44, `${name} time width`);
	expectNear(boxes.liveHeight, 32, `${name} live height`);
	expectNear(boxes.chipHeight, 28, `${name} chip height`);
	expect(boxes.listGrow).toBe("3");
	expect(boxes.listShrink).toBe("1");
	expect(boxes.listBasis).toBe("440px");
	expect(boxes.inspectorGrow).toBe("2");
	expect(boxes.inspectorShrink).toBe("1");
	expect(boxes.inspectorBasis).toBe("320px");
	expect(boxes.hubChildren).toBe(4);
}

async function measureTraffic(page: Page) {
	return page.evaluate(() => {
		const boxOf = (element: Element) => {
			const box = element.getBoundingClientRect();
			return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
		};
		const needed = (element: Element | null, label: string) => {
			if (!element) throw new Error(label);
			return element;
		};
		const pixels = (value: string) => Number.parseFloat(value);
		const flow = needed(document.querySelector("[data-if='isFlow']"), "flow");
		const column = needed(flow.children[0] ?? null, "column");
		const blocks = [...column.children];
		const columnGap =
			boxOf(needed(blocks[1] ?? null, "second block")).y - boxOf(needed(blocks[0] ?? null, "first block")).bottom;
		const rules = needed(document.querySelector("section[aria-label='How messaging works']"), "rules");
		const cards = [...needed(rules.querySelector("[data-loop='messagingRules']"), "rules loop").children];
		const firstCard = boxOf(needed(cards[0] ?? null, "rule card"));
		const secondCard = boxOf(needed(cards[1] ?? null, "second rule card"));
		const rulesGap =
			Math.abs(secondCard.y - firstCard.y) < 1 ? secondCard.x - firstCard.right : secondCard.y - firstCard.bottom;
		const hub = needed(document.querySelector("section[aria-label='Squad map']"), "hub");
		const hubStyle = getComputedStyle(hub);
		const hubContent = hub.clientWidth - pixels(hubStyle.paddingLeft) - pixels(hubStyle.paddingRight);
		const stem = boxOf(needed(hub.children[1] ?? null, "stem"));
		const bar = boxOf(needed(hub.children[2] ?? null, "bar"));
		const row = needed(document.querySelector("[data-loop='busView'] button"), "event row");
		const parts = [...row.children];
		const eventGap = boxOf(needed(parts[1] ?? null, "kind")).x - boxOf(needed(parts[0] ?? null, "time")).right;
		const list = needed(document.querySelector("section[aria-label='Message log']"), "list");
		const inspector = needed(document.querySelector("aside[aria-label='Message details']"), "inspector");
		const listStyle = getComputedStyle(list);
		const inspectorStyle = getComputedStyle(inspector);
		const listBox = boxOf(list);
		return {
			columnGap,
			rulesGap,
			stemWidth: stem.width,
			stemHeight: stem.height,
			barWidth: bar.width,
			barHeight: bar.height,
			hubContent,
			eventGap,
			timeWidth: boxOf(needed(parts[0] ?? null, "time width")).width,
			liveHeight: boxOf(needed(document.querySelector("[data-handler='toggleLive']"), "live")).height,
			chipHeight: boxOf(needed(document.querySelector("[data-loop='filters'] button"), "chip")).height,
			listGrow: listStyle.flexGrow,
			listShrink: listStyle.flexShrink,
			listBasis: listStyle.flexBasis,
			inspectorGrow: inspectorStyle.flexGrow,
			inspectorShrink: inspectorStyle.flexShrink,
			inspectorBasis: inspectorStyle.flexBasis,
			listWidth: listBox.width,
			listX: listBox.x,
			inspectorX: boxOf(inspector).x,
			hubChildren: hub.children.length,
		};
	});
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
