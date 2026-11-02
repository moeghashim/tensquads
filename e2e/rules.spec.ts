import { mkdirSync, readFileSync } from "node:fs";
import type { Page, Route } from "@playwright/test";
import { createRepositories, openPostgres, schema } from "@tensquads/adapters";
import { eq } from "drizzle-orm";

import { compareInventory, designInventory, inventoryHtml } from "../scripts/design-inventory.mjs";
import { renderDesignMarkup } from "../scripts/render-design.mjs";
import { accessibilityViolations } from "./accessibility-helper.ts";
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
import { expect, generatedEvents, installLocalFonts, openWorkspace, test } from "./workspace.ts";

const marketingResult = "Ad spend this week is $262 at a 3.4 return. The best ad set is Prints, lookalike.";
const dockReplyTimeout = 30_000;

// mainSection is owned by the frame and only accepts the sidebar and the dock.
// This cut is the same RULES marker. The match below uses the rendered design.
function rulesSection() {
	const source = readFileSync(new URL("../design/Main.dc.html", import.meta.url), "utf8");
	const marker = "<!-- ============ RULES ============ -->";
	const start = source.indexOf(marker);
	if (start < 0) {
		throw new Error("The RULES section is missing.");
	}
	const rest = source.slice(start);
	const end = rest.indexOf("<!-- ============ CHAT DOCK");
	if (end < 0) {
		throw new Error("The RULES section does not end.");
	}
	return designInventory("Main.dc.html", `<x-dc>${rest.slice(marker.length, end)}</x-dc>`);
}

test("rules shows five rules, the form and three sliders", async ({ page, workspaceUser }) => {
	await openRules(page, workspaceUser);
	await expect(page.locator("[data-loop='rules'] > div")).toHaveCount(5);
	await expect(page.getByRole("heading", { name: "New rule" })).toBeVisible();
	await expect(page.getByLabel("When")).toBeVisible();
	await expect(page.getByLabel("Agent")).toBeVisible();
	await expect(page.getByLabel("Then")).toBeVisible();
	await expect(page.getByLabel("Approval")).toBeVisible();
	await expect(page.getByRole("button", { name: "Add rule" })).toBeVisible();
	await expect(page.locator("#lim-refund")).toHaveValue("50");
	await expect(page.locator("#lim-ads")).toHaveValue("200");
	await expect(page.locator("#lim-reorder")).toHaveValue("500");
	await expect(page.locator("section[aria-label='Limits']")).toContainText("$50");
	await expect(page.locator("section[aria-label='Limits']")).toContainText("$200");
	await expect(page.locator("section[aria-label='Limits']")).toContainText("$500");
});

test("a rule switch changes only that rule", async ({ page, workspaceUser }) => {
	await openRules(page, workspaceUser);
	const switches = page.locator("[data-loop='rules'] > div").getByRole("button", { name: "Rule enabled" });
	await expect(switches).toHaveCount(5);
	for (const index of [0, 1, 2, 3]) {
		await expect(switches.nth(index)).toHaveAttribute("aria-pressed", "true");
	}
	await expect(switches.nth(4)).toHaveAttribute("aria-pressed", "false");
	await switches.nth(4).click();
	await expect(switches.nth(4)).toHaveAttribute("aria-pressed", "true");
	for (const index of [0, 1, 2, 3]) {
		await expect(switches.nth(index)).toHaveAttribute("aria-pressed", "true");
	}
	const rows = page.locator("[data-loop='rules']");
	await expect(rows).toContainText("it is Monday at 8:00");
	await expect(rows).toContainText("a refund request comes in");
});

test("the form adds a rule with the chosen trigger, agent, action and approval", async ({ page, workspaceUser }) => {
	await openRules(page, workspaceUser);
	await page.getByLabel("When").selectOption("Printify ships an item");
	await page.getByLabel("Agent").selectOption("support");
	await page.getByLabel("Then").fill(" email the customer ");
	await page.getByLabel("Approval").selectOption("Auto");
	await page.getByRole("button", { name: "Add rule" }).click();
	const added = page.locator("[data-loop='rules'] > div").nth(5);
	await expect(added).toContainText("printify ships an item");
	await expect(added).toContainText("email the customer");
	await expect(added).toContainText("Support");
	await expect(added).toContainText("Auto");
	await expect(added.getByRole("button", { name: "Rule enabled" })).toHaveAttribute("aria-pressed", "true");
	await expect(page.locator("[data-loop='rules'] > div")).toHaveCount(6);
});

test("each slider writes its policy key and shows the value", async ({ page, workspaceUser, accountId }) => {
	await openRules(page, workspaceUser);
	await setSlider(page, "#lim-refund", "55");
	await setSlider(page, "#lim-ads", "210");
	await setSlider(page, "#lim-reorder", "550");
	await expect(page.locator("section[aria-label='Limits']")).toContainText("$55");
	await expect(page.locator("section[aria-label='Limits']")).toContainText("$210");
	await expect(page.locator("section[aria-label='Limits']")).toContainText("$550");
	await expectStored(accountId, "policy.refund_auto_limit", 55);
	await expectStored(accountId, "policy.daily_ad_cap", 210);
	await expectStored(accountId, "policy.reorder_limit", 550);
});

test("a blank action adds no rule", async ({ page, workspaceUser }) => {
	await openRules(page, workspaceUser);
	await page.getByLabel("Then").fill("   ");
	await page.getByRole("button", { name: "Add rule" }).click();
	await expect(page.locator("[data-loop='rules'] > div")).toHaveCount(5);
	await expect(page.getByLabel("Then")).toHaveValue("   ");
});

test("after a new rule only the action field clears", async ({ page, workspaceUser }) => {
	await openRules(page, workspaceUser);
	await page.getByLabel("When").selectOption("A customer leaves a bad review");
	await page.getByLabel("Agent").selectOption("marketing");
	await page.getByLabel("Then").fill("pause that ad set");
	await page.getByLabel("Approval").selectOption("Ask first");
	await page.getByRole("button", { name: "Add rule" }).click();
	await expect(page.locator("[data-loop='rules'] > div")).toHaveCount(6);
	await expect(page.getByLabel("Then")).toHaveValue("");
	await expect(page.getByLabel("When")).toHaveValue("A customer leaves a bad review");
	await expect(page.getByLabel("Agent")).toHaveValue("marketing");
	await expect(page.getByLabel("Approval")).toHaveValue("Ask first");
});

test("each slider has the design minimum, maximum and step", async ({ page, workspaceUser }) => {
	await openRules(page, workspaceUser);
	await expectRange(page, "#lim-refund", "0", "200", "5");
	await expectRange(page, "#lim-ads", "0", "1000", "10");
	await expectRange(page, "#lim-reorder", "0", "2000", "50");
	await expect(page.locator("#lim-refund")).toHaveCSS("accent-color", "rgb(24, 24, 24)");
});

test("a rule switch and a slider persist after a page reload", async ({ page, workspaceUser, accountId }) => {
	await openRules(page, workspaceUser);
	const monday = page.locator("[data-loop='rules'] > div").nth(4).getByRole("button", { name: "Rule enabled" });
	await monday.click();
	await setSlider(page, "#lim-ads", "220");
	await expectRuleOn(accountId, "it is Monday at 8:00", true);
	await expectStored(accountId, "policy.daily_ad_cap", 220);
	await page.reload();
	await expect(
		page.locator("[data-loop='rules'] > div").nth(4).getByRole("button", { name: "Rule enabled" }),
	).toHaveAttribute("aria-pressed", "true");
	await expect(page.locator("#lim-ads")).toHaveValue("220");
	await expect(
		page.locator("[data-loop='rules'] > div").nth(0).getByRole("button", { name: "Rule enabled" }),
	).toHaveAttribute("aria-pressed", "true");
});

test("a chat message after a limit change carries the new limit", async ({ page, workspaceUser, accountId }) => {
	test.setTimeout(90_000);
	await openRules(page, workspaceUser);
	await setSlider(page, "#lim-refund", "65");
	await expectStored(accountId, "policy.refund_auto_limit", 65);
	await page.getByRole("button", { name: "Ask Master" }).click();
	await page.locator("#dock-input").fill("How did ads do this week?");
	await page.getByRole("button", { name: "Send" }).click();
	await expect(page.getByText(marketingResult)).toBeVisible({ timeout: dockReplyTimeout });
	const events = await generatedEvents(accountId);
	expect(events[0]?.kind).toBe("Task");
	const limits = limitsOf(events[0]?.payload);
	expect(limits.refund_auto_limit).toBe(65);
	expect(limits.daily_ad_cap).toBe(200);
});

test("the rules form stays when you leave the page", async ({ page, workspaceUser }) => {
	await openRules(page, workspaceUser);
	await page.getByLabel("Then").fill("keep this action");
	await page.getByRole("button", { name: "Overview" }).click();
	await expect(page).toHaveURL(/\/overview$/);
	await page.getByRole("button", { name: "Rules and limits" }).click();
	await expect(page.getByLabel("Then")).toHaveValue("keep this action");
});

test("a new account shows the rules card with no rows", async ({ page, workspaceUser, accountId }) => {
	await openRules(page, workspaceUser);
	await deleteRules(accountId);
	await page.reload();
	await expect(page.locator("section[aria-label='Rules']")).toBeVisible();
	await expect(page.locator("[data-loop='rules'] > div")).toHaveCount(0);
	await expect(page.getByLabel("Agent").locator("option").first()).toHaveText("Orders");
	await expect(page.getByLabel("Agent")).toHaveValue("orders");
});

test("the last slider value is the one that is stored", async ({ page, workspaceUser, accountId }) => {
	await openRules(page, workspaceUser);
	const held = await holdPosts(page, "policy.refund_auto_limit");
	await setSlider(page, "#lim-refund", "70");
	await expect.poll(() => held.length).toBe(1);
	await setSlider(page, "#lim-refund", "80");
	await expect(page.locator("#lim-refund")).toHaveValue("80");
	await held[0]?.continue();
	await expect.poll(() => held.length).toBe(2);
	await held[1]?.continue();
	await expectStored(accountId, "policy.refund_auto_limit", 80);
	await page.reload();
	await expect(page.locator("#lim-refund")).toHaveValue("80");
});

test("a failed limit write clears the guard", async ({ page, workspaceUser, accountId }) => {
	await openRules(page, workspaceUser);
	const held = await holdPosts(page, "policy.reorder_limit");
	await setSlider(page, "#lim-reorder", "450");
	await expect.poll(() => held.length).toBe(1);
	await held[0]?.fulfill({ status: 500, contentType: "text/plain", body: "The limit change failed." });
	await expect(page.locator("#lim-reorder")).toHaveValue("500");
	await expect(page).toHaveURL(/\/rules$/);
	await page.unroute("**/*");
	await setSlider(page, "#lim-reorder", "400");
	await expectStored(accountId, "policy.reorder_limit", 400);
	await expect(page.locator("#lim-reorder")).toHaveValue("400");
});

test("a hung limit write clears the guard", async ({ page, workspaceUser, accountId }) => {
	test.setTimeout(90_000);
	await openRules(page, workspaceUser);
	const held = await holdPosts(page, "policy.daily_ad_cap");
	await setSlider(page, "#lim-ads", "240");
	await expect.poll(() => held.length).toBe(1);
	await page.waitForTimeout(5_000);
	await expect(page.locator("#lim-ads")).toHaveValue("240");
	await expect(page.locator("#lim-ads")).toHaveValue("200", { timeout: 40_000 });
	await held[0]?.fulfill({ status: 500, contentType: "text/plain", body: "The limit change failed." });
	await page.unroute("**/*");
	await setSlider(page, "#lim-ads", "230");
	await expectStored(accountId, "policy.daily_ad_cap", 230);
});

test("a later change on this screen does not change an existing Mandate", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	await openRules(page, workspaceUser);
	const made = await insertMandate(accountId);
	const first = page.locator("[data-loop='rules'] > div").nth(0).getByRole("button", { name: "Rule enabled" });
	await first.click();
	await expect(first).toHaveAttribute("aria-pressed", "false");
	await page.getByLabel("Then").fill("draft a reply");
	await page.getByRole("button", { name: "Add rule" }).click();
	await expect(page.locator("[data-loop='rules'] > div")).toHaveCount(6);
	await setSlider(page, "#lim-refund", "45");
	await expectStored(accountId, "policy.refund_auto_limit", 45);
	expect(await mandateFields(accountId, made.approvalId)).toEqual(made.fields);
});

test("the rules inventory matches the rendered design", async ({ page, workspaceUser }) => {
	const cut = rulesSection();
	expect(cut.texts).toContain("Rules and limits");
	expect(cut.handlers.some((handler: { handler: string }) => handler.handler === "addRule")).toBe(true);
	await openRules(page, workspaceUser);
	const design = await designRules(page, 1440, 900);
	try {
		const built = await sectionInventory(page, "[data-if='isRules']");
		const rendered = await sectionInventory(design, "[data-if='isRules']");
		expectMatch(rendered, built);
	} finally {
		await design.close();
	}
});

test("the rules boxes match the rendered design at 1440 and 390", async ({ page, workspaceUser }) => {
	await openRules(page, workspaceUser);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await waitForScreenFonts(page);
		const design = await designRules(page, viewport.width, viewport.height);
		try {
			await waitForScreenFonts(design);
			const built = await measureRules(page);
			const drawn = await measureRules(design);
			expectRulesBoxes(built, drawn, viewport.name);
		} finally {
			await design.close();
		}
	}
});

test("tab reaches the rules controls and the focus ring is blue", async ({ page, workspaceUser }) => {
	await openRules(page, workspaceUser);
	await expectNamedButtons(page);
	await expectLabeledInputs(page);
	await page.locator("main button, main select, main input").first().focus();
	const seen = new Set<string>();
	for (let step = 0; step < 20; step += 1) {
		const key = await page.evaluate(() => {
			const element = document.activeElement;
			if (!(element instanceof HTMLElement) || !element.closest("main")) {
				return "";
			}
			const row = element.closest("[data-loop='rules'] > div");
			return [
				element.tagName,
				element.id,
				element.getAttribute("data-handler") ?? "",
				element.getAttribute("aria-label") ?? "",
				row?.textContent ?? "",
			].join("|");
		});
		if (key.length === 0 || seen.has(key)) {
			break;
		}
		seen.add(key);
		await page.keyboard.press("Tab");
	}
	expect(seen.size).toBeGreaterThanOrEqual(13);
	await page.getByLabel("When").focus();
	await page.keyboard.press("Tab");
	await expect(page.getByLabel("Agent")).toBeFocused();
	const ring = await page.evaluate(() => {
		const style = getComputedStyle(document.activeElement ?? document.body);
		return { width: style.outlineWidth, offset: style.outlineOffset, color: style.outlineColor };
	});
	expect(ring).toEqual({ width: "2px", offset: "2px", color: "rgb(1, 105, 204)" });
});

test("the rules page has no axe violation", async ({ page, workspaceUser }) => {
	await openRules(page, workspaceUser);
	expect(await accessibilityViolations(page)).toEqual([]);
});

test("the rules page does not scroll sideways at 390", async ({ page, workspaceUser }) => {
	await openRules(page, workspaceUser);
	await page.setViewportSize({ width: 390, height: 844 });
	await expectNoHorizontalScroll(page);
});

test("the rules page matches the macOS screenshot baselines", async ({ page, workspaceUser, accountId }) => {
	void accountId;
	skipUnlessMacScreenshot();
	await openRules(page, workspaceUser);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await waitForScreenFonts(page);
		await maskSelectArrows(page);
		await expect(page).toHaveScreenshot(`rules-${viewport.name}.png`, {
			fullPage: true,
			mask: [page.locator("[data-screenshot-mask='select-arrow']")],
		});
	}
});

test("the side-by-side evidence shows the design and the build", async ({ page, workspaceUser, accountId }) => {
	void accountId;
	test.skip(
		process.env.RULES_EVIDENCE !== "1" || process.platform !== "darwin",
		"Side-by-side evidence is captured once on macOS.",
	);
	const dir = ".no-mistakes/evidence/02-rules";
	mkdirSync(dir, { recursive: true });
	await openRules(page, workspaceUser);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await waitForScreenFonts(page);
		const design = await designRules(page, viewport.width, viewport.height);
		try {
			await waitForScreenFonts(design);
			const designImage = await design.screenshot({
				fullPage: true,
				animations: "disabled",
				caret: "hide",
				scale: "css",
			});
			const buildImage = await page.screenshot({
				fullPage: true,
				animations: "disabled",
				caret: "hide",
				scale: "css",
			});
			await stitch(page, designImage, buildImage, `${dir}/side-by-side-${viewport.name}.png`);
		} finally {
			await design.close();
		}
	}
});

async function openRules(page: Page, user: { email: string; password: string }) {
	await openWorkspace(page, user);
	await page.getByRole("button", { name: "Rules and limits" }).click();
	await expect(page).toHaveURL(/\/rules$/);
	await expect(page.getByRole("heading", { name: "Rules and limits" })).toBeVisible();
}

async function setSlider(page: Page, selector: string, value: string) {
	await page.locator(selector).fill(value);
}

async function expectRange(page: Page, selector: string, min: string, max: string, step: string) {
	const slider = page.locator(selector);
	await expect(slider).toHaveAttribute("min", min);
	await expect(slider).toHaveAttribute("max", max);
	await expect(slider).toHaveAttribute("step", step);
}

async function holdPosts(page: Page, key: string) {
	const held: Route[] = [];
	await page.route("**/*", async (route) => {
		const request = route.request();
		if (request.method() !== "POST" || !(request.postData() ?? "").includes(key)) {
			await route.continue();
			return;
		}
		held.push(route);
	});
	return held;
}

function limitsOf(payload: Record<string, unknown> | undefined) {
	const limits = payload?.limits;
	if (!limits || typeof limits !== "object") {
		return {};
	}
	return limits as { refund_auto_limit?: unknown; daily_ad_cap?: unknown };
}

const storedTimeout = { timeout: 20_000, intervals: [200, 500, 1_000] as number[] };

async function expectRuleOn(accountId: string, when: string, on: boolean) {
	const postgres = openPostgres(databaseUrl());
	try {
		await expect
			.poll(async () => {
				const rows = await postgres.db.select().from(schema.rules).where(eq(schema.rules.accountId, accountId));
				return rows.find((item) => item.ruleWhen === when)?.isOn;
			}, storedTimeout)
			.toBe(on);
	} finally {
		await postgres.close();
	}
}

async function expectStored(accountId: string, key: string, value: number) {
	const postgres = openPostgres(databaseUrl());
	try {
		await expect
			.poll(async () => {
				const rows = await postgres.db
					.select()
					.from(schema.stateEntries)
					.where(eq(schema.stateEntries.accountId, accountId));
				const row = rows.find((item) => item.key === key);
				return row ? (JSON.parse(row.value) as unknown) : undefined;
			}, storedTimeout)
			.toBe(value);
	} finally {
		await postgres.close();
	}
}

async function deleteRules(accountId: string) {
	const postgres = openPostgres(databaseUrl());
	try {
		await postgres.db.delete(schema.rules).where(eq(schema.rules.accountId, accountId));
	} finally {
		await postgres.close();
	}
}

async function insertMandate(accountId: string) {
	const postgres = openPostgres(databaseUrl());
	try {
		const policy = createRepositories(postgres.db).policy;
		const scope = { accountId, mode: "account" as const };
		const rule = (await policy.listRules(scope))[0];
		const pending = (await policy.listApprovals(scope)).find((item) => item.status === "Pending");
		if (!rule || !pending) {
			throw new Error("The demo account has no rule or pending approval.");
		}
		const approvalId = `${accountId}-mandate`;
		await postgres.db.insert(schema.approvals).values({
			accountId,
			id: approvalId,
			agent: pending.agent,
			title: pending.title,
			detail: pending.detail,
			amount: pending.amount,
			status: "Approved",
			sortOrder: 40,
		});
		await policy.createMandate(scope, {
			approvalId,
			ruleId: rule.id,
			limitValue: 40,
			policyVersion: "policy-1",
			saidYes: "owner",
			at: new Date("2026-11-02T12:00:00.000Z"),
		});
		return { approvalId, fields: await mandateFields(accountId, approvalId) };
	} finally {
		await postgres.close();
	}
}

async function mandateFields(accountId: string, approvalId: string) {
	const postgres = openPostgres(databaseUrl());
	try {
		const rows = await postgres.db.select().from(schema.mandates).where(eq(schema.mandates.accountId, accountId));
		const row = rows.find((item) => item.approvalId === approvalId);
		if (!row) {
			throw new Error("The Mandate is missing.");
		}
		return {
			ruleWhen: row.ruleWhen,
			ruleAction: row.ruleAction,
			ruleApproval: row.ruleApproval,
			limitValue: row.limitValue,
			policyVersion: row.policyVersion,
			saidYes: row.saidYes,
		};
	} finally {
		await postgres.close();
	}
}

function databaseUrl() {
	return secretsFor(["testDatabase"]).testDatabase;
}

async function sectionInventory(page: Page, selector: string) {
	const html = await page.locator(selector).evaluate((element) => element.outerHTML);
	return inventoryHtml(html);
}

function expectMatch(
	design: {
		texts: string[];
		handlers: { tag: string; event: string; handler: string }[];
		loops: unknown[];
		links: unknown[];
	},
	built: {
		texts: string[];
		handlers: { tag: string; event: string; handler: string }[];
		loops: unknown[];
		links: unknown[];
	},
) {
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
}

function identities(handlers: { tag: string; event: string; handler: string }[]) {
	return handlers.map((handler) => `${handler.tag}|${handler.event}|${handler.handler}`).sort();
}

async function designRules(page: Page, width: number, height: number) {
	const canvas = await page.context().newPage();
	await installLocalFonts(canvas);
	await canvas.setViewportSize({ width, height });
	const body = await renderDesignMarkup(canvas, readInventory("Main"), { view: "rules", dockOpen: false });
	const source = readFileSync(new URL("../design/Main.dc.html", import.meta.url), "utf8");
	const cssText = source.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
	const fontLink = source.match(/<link href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)" rel="stylesheet">/)?.[1];
	if (!fontLink) {
		throw new Error("The design font link is missing.");
	}
	await canvas.setContent(
		`<!doctype html><html lang="en"><head><link rel="stylesheet" href="${fontLink}"><style>${cssText}x-dc{display:contents}</style></head><body>${body}</body></html>`,
	);
	const fontFamilies = await canvas.locator('link[rel="stylesheet"]').evaluateAll((links) =>
		links.flatMap((link) => new URL((link as HTMLLinkElement).href).searchParams.getAll("family")),
	);
	expect(fontFamilies).toEqual(["Inter:wght@400;500;600", "JetBrains+Mono:wght@400;500"]);
	await canvas.evaluate(() => {
		for (const node of document.querySelectorAll("[data-loop], [data-if]")) {
			if (node instanceof HTMLElement) {
				node.style.setProperty("display", "contents");
			}
		}
		// A select value attribute does not survive HTML parsing. The design state is Ask first.
		for (const select of document.querySelectorAll("select")) {
			const value = select.getAttribute("value");
			if (value) {
				select.value = value;
			}
		}
	});
	await waitForScreenFonts(canvas);
	return canvas;
}

async function measureRules(page: Page) {
	return page.evaluate(() => {
		const boxOf = (element: Element) => {
			const box = element.getBoundingClientRect();
			return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
		};
		const rules = document.querySelector("section[aria-label='Rules']");
		const rows = rules ? [...rules.querySelectorAll("[data-loop='rules'] > div")] : [];
		const fresh = document.querySelector("section[aria-label='New rule']");
		const selects = fresh ? [...fresh.querySelectorAll("select")] : [];
		const limits = document.querySelector("section[aria-label='Limits']");
		const freshBox = fresh ? boxOf(fresh) : null;
		const limitsBox = limits ? boxOf(limits) : null;
		const cardGap =
			freshBox && limitsBox
				? limitsBox.y >= freshBox.bottom - 1
					? limitsBox.y - freshBox.bottom
					: limitsBox.x - freshBox.right
				: null;
		return {
			rules: rules ? boxOf(rules) : null,
			rowWidths: rows.map((row) => boxOf(row).width),
			rowXs: rows.map((row) => boxOf(row).x),
			rowGaps: rows.slice(1).map((row, index) => boxOf(row).y - boxOf(rows[index] ?? row).bottom),
			fresh: freshBox,
			limits: limitsBox,
			cardGap,
			selects: selects.map((select) => boxOf(select)),
		};
	});
}

type RulesBoxes = Awaited<ReturnType<typeof measureRules>>;

function expectRulesBoxes(built: RulesBoxes, design: RulesBoxes, name: string) {
	expect(built.rules).not.toBeNull();
	expect(design.rules).not.toBeNull();
	expectNear(built.rules?.width ?? 0, design.rules?.width ?? 0, `${name} rules width`);
	expectNear(built.rules?.x ?? 0, design.rules?.x ?? 0, `${name} rules x`);
	expect(built.rowWidths.length).toBe(design.rowWidths.length);
	for (const [index, width] of built.rowWidths.entries()) {
		expectNear(width, design.rowWidths[index] ?? 0, `${name} row ${index} width`);
		expectNear(built.rowXs[index] ?? 0, design.rowXs[index] ?? 0, `${name} row ${index} x`);
	}
	for (const [index, gap] of built.rowGaps.entries()) {
		expectNear(gap, design.rowGaps[index] ?? 0, `${name} row gap ${index}`);
	}
	expectNear(built.fresh?.width ?? 0, design.fresh?.width ?? 0, `${name} new rule width`);
	expectNear(built.fresh?.x ?? 0, design.fresh?.x ?? 0, `${name} new rule x`);
	expectNear(built.limits?.width ?? 0, design.limits?.width ?? 0, `${name} limits width`);
	expectNear(built.limits?.x ?? 0, design.limits?.x ?? 0, `${name} limits x`);
	expectNear(built.cardGap ?? 0, design.cardGap ?? 0, `${name} card gap`);
	expect(built.selects.length).toBe(design.selects.length);
	expect(built.selects.length).toBe(3);
	for (const [index, box] of built.selects.entries()) {
		const drawn = design.selects[index];
		expectNear(box?.x ?? 0, drawn?.x ?? 0, `${name} select ${index} x`);
		expectNear(
			(box?.y ?? 0) - (built.fresh?.y ?? 0),
			(drawn?.y ?? 0) - (design.fresh?.y ?? 0),
			`${name} select ${index} y`,
		);
		expectNear(box?.width ?? 0, drawn?.width ?? 0, `${name} select ${index} width`);
		expectNear(box?.height ?? 0, drawn?.height ?? 0, `${name} select ${index} height`);
	}
}

async function maskSelectArrows(page: Page) {
	await page.evaluate(() => {
		for (const node of document.querySelectorAll("[data-screenshot-mask='select-arrow']")) {
			node.remove();
		}
		for (const select of document.querySelectorAll("section[aria-label='New rule'] select")) {
			const box = select.getBoundingClientRect();
			const mask = document.createElement("div");
			mask.setAttribute("data-screenshot-mask", "select-arrow");
			mask.style.position = "absolute";
			mask.style.left = `${box.right + window.scrollX - 16}px`;
			mask.style.top = `${box.top + window.scrollY}px`;
			mask.style.width = "16px";
			mask.style.height = `${box.height}px`;
			document.body.append(mask);
		}
	});
}

function expectNear(actual: number, expected: number, label: string) {
	expect(Math.abs(actual - expected), `${label}: build ${actual}, design ${expected}`).toBeLessThanOrEqual(0.5);
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
