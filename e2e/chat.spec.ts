import { mkdirSync, readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { openPostgres, schema } from "@tensquads/adapters";
import { and, desc, eq } from "drizzle-orm";
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

// One worker. A second database worker holds the advisory lock, and the fixture teardown stops at 30 seconds.
test.describe.configure({ mode: "serial" });

const marketingResult = "Ad spend this week is $262 at a 3.4 return. The best ad set is Prints, lookalike.";
const noAgent =
	"That one I can answer myself, no agent needed. Ask me about orders, refunds, ads, profit or stock and I will hand it to the right agent.";
const financeResult = "Last 7 days: $8,420 revenue and $2,610 profit, a 31% margin. Printify costs are up 4%.";
const supportResult =
	"2 refund requests are open. One was under the limit and is done; the other is in your approvals.";
const ordersResult =
	"3 orders were waiting on tracking. All three now have tracking in Shopify and the customers have their links.";
const inventoryResult = "2 products are under 10: Black hoodie M and A3 frame. A reorder draft is in your approvals.";
const askLine = "Ask for anything. Master hands the work to the right squad and reports back here.";
const handoffLine = "Each message here was sent between Master and a squad. Open one to see its payload.";
const replyTimeout = 30_000;

const scriptedRoutes = [
	["Any refunds waiting?", supportResult],
	["Where is my order?", ordersResult],
	["How did ads do this week?", marketingResult],
	["What is my profit?", financeResult],
	["Is anything low on stock?", inventoryResult],
] as const;

// mainSection is owned by 02-frame and names Sidebar and CHAT DOCK only.
publicTest("the design section cutter finds the chat screen", () => {
	const chat = chatSection();
	expect(chat.texts).toContain("Hand-offs from this chat");
	const names = chat.handlers.map((handler: { handler: string }) => handler.handler);
	expect(names).toContain("s.pick");
	expect(names).toContain("onDraft");
	expect(names).toContain("send");
	expect(names).toContain("e.inspect");
	const loops = chat.loops.map((loop: { list?: string; value?: string }) => loop.list ?? loop.value);
	for (const name of ["isChat", "chat", "m.hasTag", "thinking", "suggestions", "chatBus"]) {
		expect(loops).toContain(name);
	}
});

test("the chat page shows the thread, four chips, the input and six hand-offs", async ({ page, workspaceUser }) => {
	await openChat(page, workspaceUser);
	await expect(page.getByRole("heading", { level: 1, name: "Master" })).toBeVisible();
	await expect(page.getByText(askLine)).toBeVisible();
	const thread = page.locator("[data-loop='chat']");
	await expect(thread.getByText("Did the tracking for #A-1007 go through?", { exact: true })).toBeVisible();
	await expect(thread.getByText("Orders squad, via Master")).toBeVisible();
	await expect(thread.getByText("Print ETA is 3 November. I will add its tracking automatically.")).toBeVisible();
	await expect(thread.locator(":scope > div")).toHaveCount(5);
	for (const text of [
		"Any refunds waiting?",
		"How did ads do this week?",
		"What is my profit?",
		"Is anything low on stock?",
	]) {
		await expect(page.getByRole("button", { name: text, exact: true })).toBeVisible();
	}
	await expect(page.locator("#chat-input")).toHaveAttribute("placeholder", "Message Master");
	await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
	await expect(page.getByRole("heading", { level: 2, name: "Hand-offs from this chat" })).toBeVisible();
	await expect(page.getByText(handoffLine)).toBeVisible();
	await expect(page.locator("[data-loop='chatBus'] button")).toHaveCount(6);
	const first = page.locator("[data-loop='chatBus'] button").first();
	await expect(first).toContainText("Result");
	await expect(first).toContainText("Finance → Master · 10:56");
	await expect(first).toContainText("Last 7 days: $8,420 revenue, $2,610 profit");
	await expect(page.getByRole("button", { name: "Ask Master" })).toHaveCount(0);
	await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("font-size", "28px");
	await expect(page.locator("#chat-input")).toHaveCSS("outline-offset", "6px");
	await expect(page.getByRole("button", { name: "Any refunds waiting?", exact: true })).toHaveCSS("height", "28px");
	await first.click();
	await expect(page).toHaveURL(/\/traffic$/);
	await expect(page).toHaveTitle("Agent traffic");
});

test("a message shows the bubble, the working line, then the agent reply", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	test.setTimeout(120_000);
	await openChat(page, workspaceUser);
	expect(await tasksDone(accountId)).toBe(331);
	const thread = page.locator("[data-loop='chat']");
	await page.locator("#chat-input").fill("How did ads do this week?");
	await page.getByRole("button", { name: "Send" }).click();
	await expect(thread.getByText("How did ads do this week?", { exact: true })).toBeVisible({ timeout: replyTimeout });
	await expect(thread.getByText("Passing this to the Marketing agent. I will report back here.")).toBeVisible();
	await expect(page.getByText("Marketing agent is working on it…")).toBeVisible();
	await expect(thread.getByText(marketingResult, { exact: true })).toBeVisible({ timeout: replyTimeout });
	await expect(thread.getByText("Marketing squad, via Master")).toBeVisible();
	const rows = await agentRows(accountId);
	expect(rows.reduce((sum, row) => sum + row.tasks, 0)).toBe(332);
	expect(rows.find((row) => row.id === "marketing")?.tasks).toBe(39);
	expect(rows.find((row) => row.id === "marketing")?.lastText).toBe(marketingResult);
});

test("a Task hand-off is visible while the reply is still working", async ({ page, workspaceUser, accountId }) => {
	test.setTimeout(120_000);
	await openChat(page, workspaceUser);
	let posts = 0;
	let held: { abort: () => Promise<void> } | undefined;
	await page.route("**/_serverFn/**", async (route) => {
		if (route.request().method() === "POST" && ++posts === 2) {
			held = route;
			return;
		}
		await route.continue();
	});
	const question = "How did ads do this week?";
	await page.locator("#chat-input").fill(question);
	await page.getByRole("button", { name: "Send", exact: true }).click();
	await expect(page.getByText("Marketing agent is working on it…")).toBeVisible({ timeout: replyTimeout });
	await expect.poll(() => held !== undefined).toBe(true);
	const buttons = page.locator("[data-loop='chatBus'] button");
	const first = buttons.first();
	try {
		await expect(first).toContainText("Task", { timeout: 2_000 });
		await expect(first).toContainText(question);
		await expect(buttons).toHaveCount(6);
		await expect(buttons.filter({ hasText: question })).toHaveCount(1);
	} finally {
		if (held) await held.abort();
		await page.unroute("**/_serverFn/**");
	}
	await expect(page.getByText("Marketing agent is working on it…")).toHaveCount(0, { timeout: 35_000 });
	const newest = await newestBusEvent(accountId);
	await expect(first).toContainText(newest.kind);
	await expect(first).toContainText(newest.body);
	await expect(buttons.filter({ hasText: question })).toHaveCount(1);
	await expect(buttons).toHaveCount(6);
});

test("enter sends the draft and clears the input", async ({ page, workspaceUser }) => {
	test.setTimeout(120_000);
	await openChat(page, workspaceUser);
	const input = page.locator("#chat-input");
	await input.fill("Hello there");
	await input.press("Enter");
	await expect(input).toHaveValue("");
	await expect(page.locator("[data-loop='chat']").getByText("Hello there", { exact: true })).toBeVisible({
		timeout: replyTimeout,
	});
	await expect(page.locator("[data-loop='chat']").getByText(noAgent, { exact: true })).toBeVisible({
		timeout: replyTimeout,
	});
});

test("the dock and the chat page share one thread and one draft", async ({ page, workspaceUser }) => {
	test.setTimeout(120_000);
	await openChat(page, workspaceUser);
	const input = page.locator("#chat-input");
	await input.fill("page draft");
	await page.getByRole("button", { name: "Overview" }).click();
	await expect(page).toHaveURL(/\/overview$/);
	await page.getByRole("button", { name: "Ask Master" }).click();
	const dock = page.locator("#dock-input");
	await expect(dock).toHaveValue("page draft");
	await dock.fill("dock draft");
	await page.getByRole("button", { name: "Chat with the master" }).click();
	await expect(page).toHaveURL(/\/chat$/);
	await expect(input).toHaveValue("dock draft");
	await input.fill("Hello there");
	await input.press("Enter");
	await expect(page.locator("[data-loop='chat']").getByText(noAgent, { exact: true })).toBeVisible({
		timeout: replyTimeout,
	});
	await page.getByRole("button", { name: "Overview" }).click();
	const dockThread = page.locator("[data-loop='dockChat']");
	await expect(dockThread.getByText("Hello there", { exact: true })).toBeVisible();
	await expect(dockThread.getByText(noAgent, { exact: true })).toBeVisible();
	await expect(dock).toHaveValue("");
});

test("the dock is hidden on the chat page and comes back on the next page", async ({ page, workspaceUser }) => {
	await openChat(page, workspaceUser);
	await expect(page.getByRole("button", { name: "Ask Master" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Hide chat" })).toHaveCount(0);
	await page.getByRole("button", { name: "Overview" }).click();
	const launcher = page.getByRole("button", { name: "Ask Master" });
	await expect(launcher).toBeVisible();
	await expect(launcher).toHaveAttribute("aria-expanded", "false");
});

test("a suggestion chip sends its text at once", async ({ page, workspaceUser }) => {
	test.setTimeout(120_000);
	await openChat(page, workspaceUser);
	const input = page.locator("#chat-input");
	await expect(input).toHaveValue("");
	await page.getByRole("button", { name: "Any refunds waiting?", exact: true }).click();
	await expect(input).toHaveValue("");
	const thread = page.locator("[data-loop='chat']");
	await expect(thread.getByText("Any refunds waiting?", { exact: true })).toBeVisible({ timeout: replyTimeout });
	await expect(thread.getByText(supportResult, { exact: true })).toBeVisible({ timeout: replyTimeout });
});

test("each of the five routes gets its scripted reply", async ({ page, workspaceUser, accountId }) => {
	test.setTimeout(300_000);
	await turnInventoryOn(accountId);
	const rows = await agentRows(accountId);
	expect(rows.find((row) => row.id === "inventory")?.isOn).toBe(true);
	await openChat(page, workspaceUser);
	for (const [text, reply] of scriptedRoutes) {
		await sendAndSee(page, text, reply);
	}
});

test("a new message adds to the top of the hand-offs", async ({ page, workspaceUser }) => {
	test.setTimeout(120_000);
	await openChat(page, workspaceUser);
	const first = page.locator("[data-loop='chatBus'] button").first();
	await expect(first).toContainText("Last 7 days: $8,420 revenue, $2,610 profit");
	await sendAndSee(page, "How did ads do this week?", marketingResult);
	await expect(first).toContainText("Result");
	await expect(first).toContainText(marketingResult);
	await expect(page.locator("[data-loop='chatBus'] button").nth(1)).toContainText("How did ads do this week?");
	await expect(page.locator("[data-loop='chatBus'] button")).toHaveCount(6);
});

test("the chat page matches the rendered design inventory", async ({ page, workspaceUser }) => {
	await openChat(page, workspaceUser);
	const design = await designChatInventory(page, {});
	const built = await sectionInventory(page, "[data-if='isChat']");
	expectMatch(design, built);
});

test("an empty thread and empty hand-offs add no text", async ({ page, workspaceUser, accountId }) => {
	await openChat(page, workspaceUser);
	await clearThreadAndBus(accountId);
	await page.goto("/chat");
	await expect(page.getByRole("heading", { level: 1, name: "Master" })).toBeVisible();
	await expect(page.getByText(askLine)).toBeVisible();
	await expect(page.getByRole("button", { name: "Any refunds waiting?", exact: true })).toBeVisible();
	await expect(page.locator("#chat-input")).toBeVisible();
	await expect(page.getByRole("heading", { level: 2, name: "Hand-offs from this chat" })).toBeVisible();
	await expect(page.getByText(handoffLine)).toBeVisible();
	await expect(page.locator("[data-loop='chatBus'] button")).toHaveCount(0);
	await expect(page.locator("[data-loop='chat']").locator(":scope > div")).toHaveCount(0);
	await expect(page.getByText("Did the tracking for #A-1007 go through?")).toHaveCount(0);
	const design = await designChatInventory(page, { chat: [] }, true);
	const built = await sectionInventory(page, "[data-if='isChat']");
	expectMatch(design, built);
});

test("the chat layout matches the rendered design at 1440 and 390", async ({ page, workspaceUser }) => {
	await openChat(page, workspaceUser);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await waitForScreenFonts(page);
		const designPage = await openDesignChat(page, viewport.width, viewport.height);
		try {
			await waitForScreenFonts(designPage);
			const design = await measureChat(designPage);
			const built = await measureChat(page);
			expectChatBoxes(built, design, viewport.name, viewport.width);
		} finally {
			await designPage.close();
		}
		await expectNoHorizontalScroll(page);
	}
});

test("the keyboard reaches every chat control and the focus ring matches the design", async ({
	page,
	workspaceUser,
}) => {
	await openChat(page, workspaceUser);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await expectNamedButtons(page);
		await expectLabeledInputs(page);
		await expectNoHorizontalScroll(page);
		expect(await accessibilityViolations(page)).toEqual([]);
	}
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole("button", { name: "Inventory" }).focus();
	await page.keyboard.press("Tab");
	await expect(page.getByRole("button", { name: "Any refunds waiting?", exact: true })).toBeFocused();
	await page.keyboard.press("Tab");
	await expect(page.getByRole("button", { name: "How did ads do this week?", exact: true })).toBeFocused();
	await page.keyboard.press("Tab");
	await expect(page.getByRole("button", { name: "What is my profit?", exact: true })).toBeFocused();
	await page.keyboard.press("Tab");
	await expect(page.getByRole("button", { name: "Is anything low on stock?", exact: true })).toBeFocused();
	await page.keyboard.press("Tab");
	const input = page.locator("#chat-input");
	await expect(input).toBeFocused();
	await expect(input).toHaveCSS("outline-color", "rgb(1, 105, 204)");
	await expect(input).toHaveCSS("outline-width", "2px");
	await expect(input).toHaveCSS("outline-offset", "6px");
	await page.keyboard.press("Tab");
	const send = page.getByRole("button", { name: "Send" });
	await expect(send).toBeFocused();
	await expect(send).toHaveCSS("outline-color", "rgb(1, 105, 204)");
	await expect(send).toHaveCSS("outline-width", "2px");
	await expect(send).toHaveCSS("outline-offset", "2px");
	await page.keyboard.press("Tab");
	const handoff = page.locator("[data-loop='chatBus'] button").first();
	await expect(handoff).toBeFocused();
	await expect(handoff).toHaveCSS("outline-offset", "2px");
	await expect(handoff).toHaveCSS("outline-width", "2px");
});

test("the chat page matches the macOS screenshot baselines", async ({ page, workspaceUser }) => {
	skipUnlessMacScreenshot();
	await openChat(page, workspaceUser);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await waitForScreenFonts(page);
		await expect(page.getByRole("heading", { level: 1, name: "Master" })).toBeVisible();
		await expect(page).toHaveScreenshot(`chat-${viewport.name}.png`, { fullPage: true });
	}
});

test("the side-by-side evidence shows the design and the build", async ({ page, workspaceUser }) => {
	test.skip(
		process.env.CHAT_EVIDENCE !== "1" || process.platform !== "darwin",
		"Side-by-side evidence is captured once on macOS.",
	);
	const dir = ".no-mistakes/evidence/02-chat";
	mkdirSync(dir, { recursive: true });
	await openChat(page, workspaceUser);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await waitForScreenFonts(page);
		const build = await shot(page);
		const design = await designShot(page, viewport.width, viewport.height);
		await stitch(page, design, build, `${dir}/side-by-side-${viewport.name}.png`);
	}
});

async function openChat(page: Page, user: { email: string; password: string; userId: string; accountId: string }) {
	await openWorkspace(page, user);
	await page.getByRole("button", { name: "Chat with the master" }).click();
	await expect(page).toHaveURL(/\/chat$/);
	await expect(page).toHaveTitle("Chat with the master");
}

async function sendAndSee(page: Page, text: string, reply: string) {
	const thread = page.locator("[data-loop='chat']");
	await page.locator("#chat-input").fill(text);
	await page.getByRole("button", { name: "Send" }).click();
	await expect(thread.getByText(text, { exact: true })).toBeVisible({ timeout: replyTimeout });
	await expect(thread.getByText(reply, { exact: true })).toBeVisible({ timeout: replyTimeout });
	await expect(page.getByText("agent is working on it…")).toHaveCount(0);
}

async function agentRows(accountId: string) {
	const secrets = secretsFor(["testDatabase"]);
	const postgres = openPostgres(secrets.testDatabase);
	try {
		return await postgres.db.select().from(schema.agents).where(eq(schema.agents.accountId, accountId));
	} finally {
		await postgres.close();
	}
}

async function tasksDone(accountId: string) {
	const rows = await agentRows(accountId);
	return rows.reduce((sum, row) => sum + row.tasks, 0);
}

async function newestBusEvent(accountId: string) {
	const secrets = secretsFor(["testDatabase"]);
	const postgres = openPostgres(secrets.testDatabase);
	try {
		const rows = await postgres.db
			.select()
			.from(schema.busEvents)
			.where(eq(schema.busEvents.accountId, accountId))
			.orderBy(desc(schema.busEvents.seq))
			.limit(1);
		const row = rows[0];
		if (!row) throw new Error("The bus has no event.");
		return { kind: row.kind, body: row.body };
	} finally {
		await postgres.close();
	}
}

async function turnInventoryOn(accountId: string) {
	const secrets = secretsFor(["testDatabase"]);
	const postgres = openPostgres(secrets.testDatabase);
	try {
		await postgres.db
			.update(schema.agents)
			.set({ isOn: true })
			.where(and(eq(schema.agents.accountId, accountId), eq(schema.agents.id, "inventory")));
	} finally {
		await postgres.close();
	}
}

async function clearThreadAndBus(accountId: string) {
	const secrets = secretsFor(["testDatabase"]);
	const postgres = openPostgres(secrets.testDatabase);
	try {
		await postgres.db.delete(schema.messages).where(eq(schema.messages.accountId, accountId));
		await postgres.db.delete(schema.busEvents).where(eq(schema.busEvents.accountId, accountId));
	} finally {
		await postgres.close();
	}
}

function chatSection() {
	const source = readFileSync(new URL("../design/Main.dc.html", import.meta.url), "utf8");
	const startMarker = "<!-- ============ CHAT ============ -->";
	const endMarker = "<!-- ============ AGENTS LIST ============ -->";
	const start = source.indexOf(startMarker);
	const end = source.indexOf(endMarker);
	if (start < 0 || end <= start) throw new Error("The CHAT section is missing.");
	return designInventory("Main.dc.html", `<x-dc>${source.slice(start + startMarker.length, end)}</x-dc>`);
}

async function sectionInventory(page: Page, selector: string) {
	const html = await page.locator(selector).evaluate((element) => element.outerHTML);
	return inventoryHtml(html);
}

async function designChatInventory(page: Page, state: Record<string, unknown>, dropHandoffs = false) {
	const canvas = await page.context().newPage();
	try {
		const html = await renderDesignMarkup(canvas, readInventory("Main"), { view: "chat", ...state });
		await canvas.setContent(html);
		if (dropHandoffs) {
			await canvas.locator("[data-loop='chatBus'] button").evaluateAll((nodes) => {
				for (const node of nodes) node.remove();
			});
		}
		return await sectionInventory(canvas, "[data-if='isChat']");
	} finally {
		await canvas.close();
	}
}

function expectMatch(
	design: {
		texts: string[];
		handlers: { tag: string; event: string; handler: string; text?: string }[];
		loops: unknown[];
		links: unknown[];
	},
	built: {
		texts: string[];
		handlers: { tag: string; event: string; handler: string; text?: string }[];
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

type ChatBoxes = Awaited<ReturnType<typeof measureChat>>;

function expectNear(actual: number, expected: number, label: string) {
	expect(Math.abs(actual - expected), `${label}: build ${actual}, design ${expected}`).toBeLessThanOrEqual(0.5);
}

function expectChatBoxes(built: ChatBoxes, design: ChatBoxes, name: string, width: number) {
	expect(design.messages, `${name} design messages`).toBe(5);
	expect(design.chips, `${name} design chips`).toBe(4);
	expect(design.handoffs, `${name} design hand-offs`).toBe(6);
	expect(design.column?.width ?? 0, `${name} design column`).toBeGreaterThan(100);
	expect(design.sideBySide, `${name} design row`).toBe(width === 1440);
	expect(design.displays.length, `${name} design shells`).toBeGreaterThan(3);
	for (const display of design.displays) expect(display, `${name} design shell`).toBe("contents");
	expect(built.messages).toBe(design.messages);
	expect(built.chips).toBe(design.chips);
	expect(built.handoffs).toBe(design.handoffs);
	expect(built.sideBySide).toBe(design.sideBySide);
	expect(built.displays).toEqual(design.displays);
	expectNear(design.gap, 20, `${name} design gap`);
	expectNear(built.gap, design.gap, `${name} column gap`);
	expectNear(built.column?.width ?? 0, design.column?.width ?? 0, `${name} column width`);
	expectNear(built.column?.x ?? 0, design.column?.x ?? 0, `${name} column x`);
	expectNear(built.aside?.width ?? 0, design.aside?.width ?? 0, `${name} aside width`);
	expectNear(built.aside?.x ?? 0, design.aside?.x ?? 0, `${name} aside x`);
	expect(built.messageGaps.length).toBe(design.messageGaps.length);
	expect(design.messageGaps.length).toBeGreaterThan(0);
	for (const [index, gap] of built.messageGaps.entries()) {
		expectNear(design.messageGaps[index] ?? 0, 10, `${name} design message gap ${index}`);
		expectNear(gap, design.messageGaps[index] ?? 0, `${name} message gap ${index}`);
	}
	expect(built.chipGaps.length).toBe(design.chipGaps.length);
	expect(design.chipGaps.length).toBeGreaterThan(0);
	for (const [index, gap] of built.chipGaps.entries()) {
		expectNear(gap, design.chipGaps[index] ?? 0, `${name} chip gap ${index}`);
	}
	expect(
		design.chipGaps.some((gap) => Math.abs(gap - 8) <= 0.5),
		`${name} design chip gap`,
	).toBe(true);
}

async function measureChat(page: Page) {
	return page.evaluate(() => {
		const boxOf = (element: Element) => {
			const box = element.getBoundingClientRect();
			return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
		};
		const heading = document.querySelector("[data-if='isChat'] h1");
		const column = heading?.parentElement?.parentElement ?? null;
		const aside = document.querySelector("aside[aria-label='Hand-offs from this chat']");
		const columnBox = column ? boxOf(column) : null;
		const asideBox = aside ? boxOf(aside) : null;
		const sideBySide = Boolean(columnBox && asideBox && asideBox.x >= columnBox.right - 1);
		const gap =
			columnBox && asideBox ? (sideBySide ? asideBox.x - columnBox.right : asideBox.y - columnBox.bottom) : 0;
		const loop = document.querySelector("[data-loop='chat']");
		const bubbles = loop ? [...loop.children].filter((node) => node instanceof HTMLElement) : [];
		const messageGaps = bubbles.slice(1).map((node, index) => boxOf(node).y - boxOf(bubbles[index] ?? node).bottom);
		const chipRoot = document.querySelector("[data-loop='suggestions']");
		const chips = chipRoot ? [...chipRoot.querySelectorAll("button")] : [];
		const chipGaps = chips.slice(1).map((chip, index) => {
			const next = boxOf(chip);
			const prev = boxOf(chips[index] ?? chip);
			return Math.abs(next.y - prev.y) <= 1 ? next.x - prev.right : next.y - prev.bottom;
		});
		const root = document.querySelector("[data-if='isChat']");
		const marked = root ? [root, ...root.querySelectorAll("[data-loop], [data-if]")] : [];
		const displays = marked.map((node) => getComputedStyle(node).display);
		return {
			column: columnBox,
			aside: asideBox,
			gap,
			sideBySide,
			messages: bubbles.length,
			messageGaps,
			chips: chips.length,
			chipGaps,
			handoffs: document.querySelectorAll("[data-loop='chatBus'] button").length,
			displays,
		};
	});
}

async function openDesignChat(page: Page, width: number, height: number) {
	const canvas = await page.context().newPage();
	await installLocalFonts(canvas);
	await canvas.setViewportSize({ width, height });
	const body = await renderDesignMarkup(canvas, readInventory("Main"), { view: "chat" });
	const source = readFileSync(new URL("../design/Main.dc.html", import.meta.url), "utf8");
	const cssText = source.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
	await canvas.setContent(
		`<!doctype html><html lang="en"><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"><style>${cssText}x-dc{display:contents}</style></head><body>${body}</body></html>`,
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

async function shot(page: Page) {
	return page.screenshot({ fullPage: true, animations: "disabled", caret: "hide", scale: "css" });
}

async function designShot(page: Page, width: number, height: number) {
	const canvas = await openDesignChat(page, width, height);
	try {
		return await shot(canvas);
	} finally {
		await canvas.close();
	}
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
