import { mkdirSync, readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { openPostgres, schema } from "@tensquads/adapters";
import { and, eq } from "drizzle-orm";
import { compareInventory, designInventory, inventoryHtml } from "../scripts/design-inventory.mjs";
import { renderDesignMarkup } from "../scripts/render-design.mjs";
import { accessibilityViolations } from "./accessibility-helper.ts";
import {
	expectLabeledInputs,
	expectNamedButtons,
	expectNoHorizontalScroll,
	test as publicTest,
	readInventory,
	secretsFor,
	skipUnlessMacScreenshot,
	viewports,
	waitForScreenFonts,
} from "./support.ts";
import { expect, installLocalFonts, openWorkspace, test } from "./workspace.ts";

const pendingLine = "Mission pending. Master has proposed one; approve it in the inbox.";
const sandboxLine =
	"Each squad is one agent with its own tools. It runs alone in its own sandbox server, with only its own skills, keys and network access. Squads work together only through Master, and each one has a mission it is scored on.";
const taskCounts = [142, 96, 38, 24, 31] as const;
const dash = "—";

// One worker. A second reset holds the shared database lock, so the first teardown exceeds 30 seconds.
test.describe.configure({ mode: "serial", timeout: 90_000 });

publicTest("the design section cutter finds the agents list", () => {
	const section = agentsSection();
	expect(section.texts).toContain("Squads");
	expect(section.texts).toContain("tasks");
	expect(section.texts).toContain("success");
	expect(section.handlers).toEqual([{ tag: "button", event: "onClick", handler: "a.open" }]);
	expect(section.loops).toEqual([
		{ kind: "for", list: "agents", as: "a" },
		{ kind: "for", list: "a.skillChips", as: "sk" },
		{ kind: "if", value: "isAgentList" },
	]);
});

test("the list shows five cards with status, autonomy, tasks and chips", async ({ page, workspaceUser }) => {
	await openAgents(page, workspaceUser);
	await expect(page.getByRole("heading", { name: "Squads" })).toBeVisible();
	await expect(page).toHaveTitle("Agents");
	await expect(cards(page)).toHaveCount(5);
	expect(taskCounts.reduce((sum, count) => sum + count, 0)).toBe(331);
	for (const [index, count] of taskCounts.entries()) {
		await expect(cards(page).nth(index)).toContainText(`${count} tasks`);
	}
	await expect(card(page, "Orders")).toContainText("Running");
	await expect(card(page, "Orders")).toContainText("Full auto");
	await expect(card(page, "Orders")).toContainText("shopify.fulfill_order");
	await expect(card(page, "Orders")).toContainText("printify.get_shipment");
	await expect(card(page, "Orders")).toContainText("shopify.add_tracking");
	await expect(card(page, "Orders")).not.toContainText("notify.customer");
	await expect(card(page, "Support")).toContainText("Auto under limit");
	await expect(card(page, "Marketing")).toContainText("Ask first");
	await expect(card(page, "Finance")).toContainText("Full auto");
	await expect(card(page, "Inventory")).toContainText("Paused");
	await expect(card(page, "Inventory")).toContainText("Ask first");
});

test("a card opens that agent's dashboard", async ({ page, workspaceUser }) => {
	await openAgents(page, workspaceUser);
	await card(page, "Orders").click();
	await expect(page).toHaveURL(/\/agents\/orders$/);
	await expect(page).toHaveTitle("Agent dashboard");
});

test("a running agent shows Running and a paused agent shows Paused", async ({ page, workspaceUser }) => {
	await openAgents(page, workspaceUser);
	const running = card(page, "Orders").getByText("Running", { exact: true });
	const paused = card(page, "Inventory").getByText("Paused", { exact: true });
	await expect(running).toBeVisible();
	await expect(paused).toBeVisible();
	await expect(running).toHaveCSS("color", "rgb(0, 105, 42)");
	await expect(paused).toHaveCSS("color", "rgb(93, 93, 93)");
});

test("an agent with no mission shows the pending line and Pending", async ({ page, workspaceUser }) => {
	await openAgents(page, workspaceUser);
	const mission = card(page, "Inventory").getByText(pendingLine);
	await expect(mission).toBeVisible();
	await expect(mission).toHaveCSS("color", "rgb(146, 59, 15)");
	await expect(card(page, "Inventory").getByText("Pending", { exact: true })).toBeVisible();
	const bar = await barOf(card(page, "Inventory"));
	expect(bar.color).toBe("rgb(205, 205, 205)");
	expect(bar.label).toBe("Pending");
	expect(bar.fill).toBeLessThanOrEqual(0.5);
	const orders = card(page, "Orders");
	await expect(orders.getByText("Ship every order within 24 hours and keep the customer informed.")).toHaveCSS(
		"color",
		"rgb(40, 40, 40)",
	);
	expect((await barOf(orders)).label).toBe("72% done");
});

test("the bar colour follows the contribution value", async ({ page, workspaceUser, accountId }) => {
	await setAgent(accountId, "marketing", { contribution: 40 });
	await setAgent(accountId, "inventory", { contribution: 90 });
	await openAgents(page, workspaceUser);
	await expectBar(card(page, "Marketing"), "rgb(251, 106, 34)", "40% done", 0.4);
	await expectBar(card(page, "Inventory"), "rgb(205, 205, 205)", "Pending", 0);
	await expectBar(card(page, "Orders"), "rgb(24, 24, 24)", "72% done", 0.72);
	await expectBar(card(page, "Support"), "rgb(0, 162, 64)", "81% done", 0.81);
	await expectBar(card(page, "Finance"), "rgb(0, 162, 64)", "90% done", 0.9);
});

test("a card shows at most three skills that are on", async ({ page, workspaceUser, accountId }) => {
	await setSkillOff(accountId, "orders", "shopify.fulfill_order");
	await openAgents(page, workspaceUser);
	expect(await chipNames(card(page, "Orders"))).toEqual([
		"printify.get_shipment",
		"shopify.add_tracking",
		"notify.customer",
	]);
	expect(await chipNames(card(page, "Finance"))).toEqual(["stripe.payouts", "quickbooks.pnl", "costs.reconcile"]);
	expect(await chipNames(card(page, "Support"))).toEqual(["inbox.read", "inbox.draft_reply", "shopify.refund"]);
	for (const name of ["Orders", "Support", "Marketing", "Finance", "Inventory"]) {
		expect((await chipNames(card(page, name))).length).toBeLessThanOrEqual(3);
	}
});

test("a blank host, region, or success shows an em dash", async ({ page, workspaceUser, accountId }) => {
	await setAgent(accountId, "finance", { success: "", tasks: 0 });
	await setMachine(accountId, "finance", { host: "", region: "" });
	await openAgents(page, workspaceUser);
	const finance = card(page, "Finance");
	await expect(finance).toContainText(`${dash} · ${dash}`);
	await expect(finance).toContainText(`${dash} success`);
	await expect(finance).toContainText("0 tasks");
	await expect(card(page, "Orders")).toContainText("vps-orders-01 · Frankfurt");
	await expect(card(page, "Orders")).toContainText("142 tasks");
	await expect(card(page, "Orders")).toContainText("98% success");
});

test("an empty list shows the heading and no cards", async ({ page, workspaceUser, accountId }) => {
	await clearAgents(accountId);
	await openAgents(page, workspaceUser);
	await expect(page.getByRole("heading", { name: "Squads" })).toBeVisible();
	await expect(page.locator("main")).toContainText(sandboxLine);
	await expect(cards(page)).toHaveCount(0);
});

test("the agents list matches the rendered design inventory", async ({ page, workspaceUser }) => {
	await openAgents(page, workspaceUser);
	const designPage = await openDesignAgents(page, 1440, 900);
	try {
		const design = await sectionInventory(designPage, "[data-if='isAgentList']");
		const built = await sectionInventory(page, "[data-if='isAgentList']");
		expect(design.texts).toContain("Squads");
		expect(design.texts).toContain(sandboxLine);
		expect(design.handlers).toHaveLength(5);
		expectMatch(design, built);
	} finally {
		await designPage.close();
	}
});

test("the keyboard reaches every card and shows the focus ring", async ({ page, workspaceUser }) => {
	await openAgents(page, workspaceUser);
	const seen = new Set<string>();
	let ring: { width: string; offset: string; color: string } | null = null;
	for (let step = 0; step < 40; step += 1) {
		await page.keyboard.press("Tab");
		const hit = await focusedCard(page);
		if (!hit) {
			continue;
		}
		seen.add(hit.text);
		ring ??= { width: hit.width, offset: hit.offset, color: hit.color };
	}
	expect(seen.size).toBe(5);
	expect(ring).toEqual({ width: "2px", offset: "2px", color: "rgb(1, 105, 204)" });
});

test("the agents list has no accessibility violations and fits the width", async ({ page, workspaceUser }) => {
	await openAgents(page, workspaceUser);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		expect(await accessibilityViolations(page)).toEqual([]);
		await expectNamedButtons(page);
		await expectLabeledInputs(page);
		await expectNoHorizontalScroll(page);
	}
});

test("the agent cards match the rendered design at 1440 and 390", async ({ page, workspaceUser }) => {
	await openAgents(page, workspaceUser);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await waitForScreenFonts(page);
		const designPage = await openDesignAgents(page, viewport.width, viewport.height);
		try {
			const design = await measureAgents(designPage);
			const built = await measureAgents(page);
			expectAgentBoxes(built, design, viewport.name);
		} finally {
			await designPage.close();
		}
	}
});

test("the agents list matches the macOS screenshot baselines", async ({ page, workspaceUser }) => {
	skipUnlessMacScreenshot();
	await openAgents(page, workspaceUser);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await waitForScreenFonts(page);
		await expect(page).toHaveScreenshot(`agents-${viewport.name}.png`, { fullPage: true });
	}
});

test("the side-by-side evidence shows the design and the build", async ({ page, workspaceUser }) => {
	test.skip(
		process.env.AGENTS_EVIDENCE !== "1" || process.platform !== "darwin",
		"Side-by-side evidence is captured once on macOS.",
	);
	const dir = ".no-mistakes/evidence/02-agents";
	mkdirSync(dir, { recursive: true });
	await openAgents(page, workspaceUser);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await waitForScreenFonts(page);
		const built = await shot(page);
		const designPage = await openDesignAgents(page, viewport.width, viewport.height);
		try {
			const design = await shot(designPage);
			await stitch(page, design, built, `${dir}/side-by-side-${viewport.name}.png`);
		} finally {
			await designPage.close();
		}
	}
});

function cards(page: Page) {
	return page.locator("main [data-handler='a.open']");
}

function card(page: Page, name: string) {
	return cards(page)
		.filter({ has: page.getByText(name, { exact: true }) })
		.first();
}

async function openAgents(page: Page, user: { email: string; password: string; userId: string; accountId: string }) {
	await openWorkspace(page, user);
	await page.goto("/agents");
	await expect(page.getByRole("heading", { name: "Squads" })).toBeVisible();
}

async function expectBar(target: Locator, color: string, label: string, ratio: number) {
	const bar = await barOf(target);
	expect(bar.color).toBe(color);
	expect(bar.label).toBe(label);
	expectNear(bar.fill, bar.track * ratio, label);
}

async function barOf(target: Locator) {
	return target.evaluate((button) => {
		const fill = [...button.querySelectorAll("div")].find(
			(node) => node.style.height === "100%" && node.style.width.endsWith("%"),
		);
		const label = [...button.querySelectorAll("span")].find((node) => node.style.width === "64px");
		const track = fill?.parentElement;
		if (!fill || !track || !label) {
			return { color: "", label: "", fill: -1, track: -1 };
		}
		return {
			color: getComputedStyle(fill).backgroundColor,
			label: (label.textContent ?? "").trim(),
			fill: fill.getBoundingClientRect().width,
			track: track.getBoundingClientRect().width,
		};
	});
}

async function chipNames(target: Locator) {
	return target.evaluate((button) => {
		return [...button.querySelectorAll("span")]
			.filter((span) => span.style.fontSize === "11px")
			.map((span) => (span.textContent ?? "").trim());
	});
}

async function focusedCard(page: Page) {
	return page.evaluate(() => {
		const main = document.querySelector("main");
		const node = document.activeElement;
		if (!(node instanceof HTMLElement) || !main?.contains(node)) {
			return null;
		}
		if (node.getAttribute("data-handler") !== "a.open") {
			return null;
		}
		const style = getComputedStyle(node);
		return {
			text: (node.textContent ?? "").replace(/\s+/g, " ").trim(),
			width: style.outlineWidth,
			offset: style.outlineOffset,
			color: style.outlineColor,
		};
	});
}

function agentsSection() {
	const source = readFileSync(new URL("../design/Main.dc.html", import.meta.url), "utf8");
	const marker = "<!-- ============ AGENTS LIST ============ -->";
	const start = source.indexOf(marker);
	if (start < 0) {
		throw new Error("The AGENTS LIST section is missing.");
	}
	const rest = source.slice(start);
	const end = rest.indexOf("<!-- ============ AGENT DETAIL ============ -->");
	if (end < 0) {
		throw new Error("The AGENTS LIST section does not end.");
	}
	return designInventory("Main.dc.html", `<x-dc>${rest.slice(marker.length, end)}</x-dc>`);
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

async function openDesignAgents(page: Page, width: number, height: number) {
	const canvas = await page.context().newPage();
	await installLocalFonts(canvas);
	await canvas.setViewportSize({ width, height });
	const body = await renderDesignMarkup(canvas, readInventory("Main"), { view: "agents", dockOpen: false });
	const source = readFileSync(new URL("../design/Main.dc.html", import.meta.url), "utf8");
	const helmet = source.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
	await canvas.setContent(
		`<!doctype html><html lang="en"><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"><style>${helmet}x-dc{display:contents}strong{font-weight:600}</style></head><body>${body}</body></html>`,
	);
	await canvas.locator("[data-handler='goAdmin']").evaluate((element) => element.remove());
	await canvas.evaluate(() => {
		for (const node of document.querySelectorAll("[data-loop], [data-if]")) {
			if (node instanceof HTMLElement) node.style.setProperty("display", "contents");
		}
	});
	await waitForScreenFonts(canvas);
	return canvas;
}

type AgentBoxes = Awaited<ReturnType<typeof measureAgents>>;

function expectNear(actual: number, expected: number, label: string) {
	expect(Math.abs(actual - expected), `${label}: build ${actual}, design ${expected}`).toBeLessThanOrEqual(0.5);
}

function expectAgentBoxes(built: AgentBoxes, design: AgentBoxes, name: string) {
	expect(design.cards.length).toBe(5);
	expect(built.cards.length).toBe(design.cards.length);
	expect(built.gaps.length).toBe(design.gaps.length);
	expectNear(built.grid?.width ?? 0, design.grid?.width ?? 0, `${name} grid width`);
	expectNear(built.grid?.x ?? 0, design.grid?.x ?? 0, `${name} grid x`);
	for (const [index, box] of built.cards.entries()) {
		const target = design.cards[index] ?? { x: 0, y: 0, width: 0, height: 0 };
		expectNear(box.width, target.width, `${name} card ${index} width`);
		expectNear(box.x, target.x, `${name} card ${index} x`);
		expectNear(box.y, target.y, `${name} card ${index} y`);
		expectNear(box.height, target.height, `${name} card ${index} height`);
	}
	for (const [index, gap] of built.gaps.entries()) {
		expectNear(gap, design.gaps[index] ?? 0, `${name} gap ${index}`);
	}
}

async function measureAgents(page: Page) {
	return page.evaluate(() => {
		const boxOf = (element: Element) => {
			const box = element.getBoundingClientRect();
			return { x: box.x, y: box.y, width: box.width, height: box.height };
		};
		const section = document.querySelector("[data-if='isAgentList']");
		const nodes = section ? [...section.querySelectorAll("[data-handler='a.open']")] : [];
		const cards = nodes.map((node) => boxOf(node));
		const gaps = cards.slice(1).map((box, index) => {
			const previous = cards[index] ?? box;
			const sameRow = Math.abs(box.y - previous.y) < 1;
			return sameRow ? box.x - (previous.x + previous.width) : box.y - (previous.y + previous.height);
		});
		const grid = section?.querySelector("[data-loop='agents']")?.parentElement ?? null;
		return { cards, gaps, grid: grid ? boxOf(grid) : null };
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

async function withDb(run: (db: Awaited<ReturnType<typeof openPostgres>>["db"]) => Promise<void>) {
	const secrets = secretsFor(["testDatabase"]);
	const postgres = openPostgres(secrets.testDatabase);
	try {
		await run(postgres.db);
	} finally {
		await postgres.close();
	}
}

async function setAgent(
	accountId: string,
	agentId: string,
	values: { contribution?: number; success?: string; tasks?: number },
) {
	await withDb(async (db) => {
		await db
			.update(schema.agents)
			.set(values)
			.where(and(eq(schema.agents.accountId, accountId), eq(schema.agents.id, agentId)));
	});
}

async function setMachine(accountId: string, agentId: string, values: { host: string; region: string }) {
	await withDb(async (db) => {
		await db
			.update(schema.machines)
			.set(values)
			.where(and(eq(schema.machines.accountId, accountId), eq(schema.machines.agentId, agentId)));
	});
}

async function setSkillOff(accountId: string, agentId: string, skillId: string) {
	await withDb(async (db) => {
		await db
			.update(schema.skills)
			.set({ isOn: false })
			.where(
				and(
					eq(schema.skills.accountId, accountId),
					eq(schema.skills.agentId, agentId),
					eq(schema.skills.id, skillId),
				),
			);
	});
}

async function clearAgents(accountId: string) {
	await withDb(async (db) => {
		await db.delete(schema.skills).where(eq(schema.skills.accountId, accountId));
		await db.delete(schema.machines).where(eq(schema.machines.accountId, accountId));
		await db.delete(schema.agents).where(eq(schema.agents.accountId, accountId));
	});
}
