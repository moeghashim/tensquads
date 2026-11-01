import type { Page } from "@playwright/test";
import { compareInventory, inventoryHtml } from "../scripts/design-inventory.mjs";
import { renderDesignMarkup } from "../scripts/render-design.mjs";
import { accessibilityViolations } from "./accessibility-helper.ts";
import {
	expectLabeledInputs,
	expectNamedButtons,
	expectNoHorizontalScroll,
	test as publicTest,
	readInventory,
	skipUnlessMacScreenshot,
	viewports,
	waitForScreenFonts,
} from "./support.ts";
import { expect, generatedEvents, mainSection, openWorkspace, test } from "./workspace.ts";

const marketingResult = "Ad spend this week is $262 at a 3.4 return. The best ad set is Prints, lookalike.";
const noAgent =
	"That one I can answer myself, no agent needed. Ask me about orders, refunds, ads, profit or stock and I will hand it to the right agent.";
const paused = "That is a job for the Inventory agent, but it is paused. Turn it on in Agents and ask me again.";

publicTest("the design section cutter finds the sidebar and the dock", () => {
	const side = mainSection("Sidebar");
	expect(side.texts).toContain("Overview");
	expect(side.texts).toContain("All companies");
	expect(side.handlers.some((handler: { handler: string }) => handler.handler === "goOverview")).toBe(true);
	const dock = mainSection("CHAT DOCK");
	const names = dock.handlers.map((handler: { handler: string }) => handler.handler);
	expect(names).toContain("send");
	expect(names).toContain("onDraft");
});

test("the sidebar marks the current page and the agent rows show status and open the dashboard", async ({
	page,
	workspaceUser,
}) => {
	await openWorkspace(page, workspaceUser);
	await expect(page).toHaveTitle("tensquads workspace");
	await expect(page.locator("main")).toHaveText("");
	await expect(page.getByText("Runs 5 squads · Demo store")).toBeVisible();
	await expect(page.getByText("Moe Ghashim")).toBeVisible();
	const overview = page.getByRole("button", { name: "Overview" });
	const chat = page.getByRole("button", { name: "Chat with the master" });
	await expect(overview).toHaveCSS("font-weight", "600");
	await expect(overview).toHaveCSS("color", "rgb(13, 13, 13)");
	await expect(chat).toHaveCSS("font-weight", "400");
	await expect(chat).toHaveCSS("color", "rgb(65, 65, 65)");
	await expect(page.getByRole("img", { name: "Running" })).toHaveCount(4);
	await expect(page.getByRole("img", { name: "Paused" })).toHaveCount(1);
	await expect(page.getByRole("img", { name: "Running" }).first()).toHaveCSS("background-color", "rgb(0, 162, 64)");
	await expect(page.getByRole("img", { name: "Paused" })).toHaveCSS("background-color", "rgb(205, 205, 205)");
	await page.getByRole("button", { name: "Squads" }).click();
	await expect(page).toHaveURL(/\/agents$/);
	await expect(page).toHaveTitle("Agents");
	await expect(page.getByRole("button", { name: "Squads" })).toHaveCSS("font-weight", "600");
	await page.getByRole("button", { name: "Inventory" }).click();
	await expect(page).toHaveURL(/\/agents\/inventory$/);
	await expect(page).toHaveTitle("Agent dashboard");
	await expect(page.getByRole("button", { name: "Squads" })).toHaveCSS("font-weight", "600");
	await page.getByRole("button", { name: "Squad traffic" }).click();
	await expect(page).toHaveURL(/\/traffic$/);
	await expect(page).toHaveTitle("Agent traffic");
	await expect(page.getByRole("button", { name: "Squad traffic" })).toHaveCSS("font-weight", "600");
	await page.getByRole("button", { name: "Rules and limits" }).click();
	await expect(page).toHaveURL(/\/rules$/);
	await expect(page).toHaveTitle("Rules and limits");
	await expect(page.locator("main")).toHaveText("");
});

test("the dock shows the badge, opens the panel, and hides on the chat page", async ({ page, workspaceUser }) => {
	await openWorkspace(page, workspaceUser);
	const launcher = page.getByRole("button", { name: "Ask Master" });
	await expect(launcher).toHaveAttribute("aria-expanded", "false");
	await expect(page.locator("[data-if='dockUnread']")).toHaveText("4");
	await expect(page.getByText("Did the tracking for #A-1007 go through?")).toHaveCount(0);
	await launcher.click();
	await expect(page.getByRole("button", { name: "Hide chat" })).toHaveAttribute("aria-expanded", "true");
	await expect(page.locator("[data-if='dockUnread']")).toHaveCount(0);
	await expect(page.getByText("4 squads online")).toBeVisible();
	await expect(page.getByText("Did the tracking for #A-1007 go through?")).toBeVisible();
	await expect(page.getByRole("button", { name: "Any refunds waiting?" })).toBeVisible();
	await page.locator("#dock-input").fill("keep this");
	await page.getByRole("button", { name: "Rules and limits" }).click();
	await expect(page.locator("#dock-input")).toHaveValue("keep this");
	await page.getByRole("button", { name: "Chat with the master" }).click();
	await expect(page).toHaveURL(/\/chat$/);
	await expect(page).toHaveTitle("Chat with the master");
	await expect(page.getByRole("button", { name: "Ask Master" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Hide chat" })).toHaveCount(0);
	await expect(page.locator("main")).toHaveText("");
	await page.getByRole("button", { name: "Overview" }).click();
	await expect(page.locator("#dock-input")).toHaveValue("keep this");
});

test("a dock message shows the bubble, the working line, the reply, and writes the events", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	await openWorkspace(page, workspaceUser);
	await page.getByRole("button", { name: "Ask Master" }).click();
	await page.locator("#dock-input").fill("How did ads do this week?");
	await page.getByRole("button", { name: "Send" }).click();
	await expect(page.getByText("How did ads do this week?")).toBeVisible();
	await expect(page.getByText("Passing this to the Marketing agent. I will report back here.")).toBeVisible();
	await expect(page.getByText("Marketing agent is working on it…")).toBeVisible();
	await expect(page.getByText(marketingResult)).toBeVisible({ timeout: 10_000 });
	await expect(page.getByText("Did the tracking for #A-1007 go through?")).toHaveCount(0);
	await expect(page.locator("[data-loop='dockChat'] > div")).toHaveCount(6);
	const events = await generatedEvents(accountId);
	expect(events.map((event) => event.id)).toEqual(["e102", "e104"]);
	expect(events[0]?.kind).toBe("Task");
	expect(events[0]?.skill).toBe("meta_ads.report");
	expect(events[1]?.kind).toBe("Result");
	expect(events[1]?.timeText).toBe("11:04");
});

test("a message with no agent gets the master answer and no event", async ({ page, workspaceUser, accountId }) => {
	await openWorkspace(page, workspaceUser);
	await page.getByRole("button", { name: "Ask Master" }).click();
	await page.getByRole("button", { name: "How did ads do this week?" }).waitFor();
	await page.locator("#dock-input").fill("Hello there");
	await page.getByRole("button", { name: "Send" }).click();
	await expect(page.getByText("Hello there")).toBeVisible();
	await expect(page.getByText(noAgent)).toBeVisible();
	await expect(page.getByText("agent is working on it…")).toHaveCount(0);
	expect(await generatedEvents(accountId)).toEqual([]);
});

test("a message to a paused agent gets the paused answer and no event", async ({ page, workspaceUser, accountId }) => {
	await openWorkspace(page, workspaceUser);
	await page.getByRole("button", { name: "Ask Master" }).click();
	await page.locator("#dock-input").fill("Is anything low on stock?");
	await page.getByRole("button", { name: "Send" }).click();
	await expect(page.getByText(paused)).toBeVisible();
	await expect(page.getByText("agent is working on it…")).toHaveCount(0);
	expect(await generatedEvents(accountId)).toEqual([]);
});

test("an empty message or a second send does nothing", async ({ page, workspaceUser, accountId }) => {
	await openWorkspace(page, workspaceUser);
	await page.getByRole("button", { name: "Ask Master" }).click();
	await page.locator("#dock-input").fill("   ");
	await page.locator("#dock-input").press("Enter");
	await expect(page.locator("[data-loop='dockChat'] > div")).toHaveCount(5);
	expect(await generatedEvents(accountId)).toEqual([]);
	await page.locator("#dock-input").fill("How did ads do this week?");
	await page.getByRole("button", { name: "Send" }).click();
	await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
	await page.locator("#dock-input").fill("Hello there");
	await page.locator("#dock-input").press("Enter");
	await expect(page.getByText(marketingResult)).toBeVisible({ timeout: 10_000 });
	await expect(page.getByText(noAgent)).toHaveCount(0);
	const events = await generatedEvents(accountId);
	expect(events.map((event) => `${event.kind}`)).toEqual(["Task", "Result"]);
});

test("the closed and open frame match the sidebar and dock inventory", async ({ page, workspaceUser }) => {
	await openWorkspace(page, workspaceUser);
	await expectSame(page, false);
	await page.getByRole("button", { name: "Ask Master" }).click();
	await expectSame(page, true);
});

test("the frame has no accessibility violations", async ({ page, workspaceUser }) => {
	await openWorkspace(page, workspaceUser);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		expect(await accessibilityViolations(page)).toEqual([]);
		await page.getByRole("button", { name: "Ask Master" }).click();
		expect(await accessibilityViolations(page)).toEqual([]);
		await page.getByRole("button", { name: "Hide chat" }).click();
	}
});

test("the frame names its controls and fits the width", async ({ page, workspaceUser }) => {
	await openWorkspace(page, workspaceUser);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await expectNamedButtons(page);
		await expectLabeledInputs(page);
		await expectNoHorizontalScroll(page);
		await page.getByRole("button", { name: "Ask Master" }).click();
		await expectNamedButtons(page);
		await expectLabeledInputs(page);
		await expectNoHorizontalScroll(page);
		await page.getByRole("button", { name: "Hide chat" }).click();
	}
});

test("the keyboard reaches the dock, shows the focus ring, and Enter sends", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	await openWorkspace(page, workspaceUser);
	await page.getByRole("button", { name: "Ask Master" }).click();
	await expect(page.getByRole("button", { name: "Hide chat" })).toBeFocused();
	await page.keyboard.press("Shift+Tab");
	const send = page.getByRole("button", { name: "Send" });
	await expect(send).toBeFocused();
	await expect(send).toHaveCSS("outline-color", "rgb(1, 105, 204)");
	await expect(send).toHaveCSS("outline-width", "2px");
	await page.keyboard.press("Shift+Tab");
	const input = page.locator("#dock-input");
	await expect(input).toBeFocused();
	await expect(input).toHaveCSS("outline-offset", "4px");
	await input.fill("Hello there");
	await input.press("Enter");
	await expect(page.getByText(noAgent)).toBeVisible();
	expect(await generatedEvents(accountId)).toEqual([]);
});

test("the frame matches the macOS screenshot baselines", async ({ page, workspaceUser }) => {
	skipUnlessMacScreenshot();
	await openWorkspace(page, workspaceUser);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await waitForScreenFonts(page);
		await expect(page).toHaveScreenshot(`frame-closed-${viewport.name}.png`, { fullPage: true });
		await page.getByRole("button", { name: "Ask Master" }).click();
		await waitForScreenFonts(page);
		await expect(page).toHaveScreenshot(`frame-open-${viewport.name}.png`, { fullPage: true });
		await page.getByRole("button", { name: "Hide chat" }).click();
	}
});

async function expectSame(page: Page, dockOpen: boolean) {
	const design = await designParts(page, dockOpen);
	const builtSide = await sectionInventory(page, "[data-if='notAdmin']");
	const builtDock = await sectionInventory(page, "[data-if='showDock']");
	expectMatch(design.side, builtSide);
	expectMatch(design.dock, builtDock);
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

async function sectionInventory(page: Page, selector: string) {
	const html = await page.locator(selector).evaluate((element) => element.outerHTML);
	return inventoryHtml(html);
}

async function designParts(page: Page, dockOpen: boolean) {
	const canvas = await page.context().newPage();
	try {
		const html = await renderDesignMarkup(canvas, readInventory("Main"), { view: "overview", dockOpen });
		await canvas.setContent(html);
		await canvas.locator("[data-handler='goAdmin']").evaluate((element) => element.remove());
		return {
			side: await sectionInventory(canvas, "[data-if='notAdmin']"),
			dock: await sectionInventory(canvas, "[data-if='showDock']"),
		};
	} finally {
		await canvas.close();
	}
}
