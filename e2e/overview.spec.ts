import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import type { Page, Request, Route } from "@playwright/test";
import { openPostgres, schema } from "@tensquads/adapters";
import { policyVersion } from "@tensquads/domain";
import { and, asc, eq } from "drizzle-orm";
import { replaceDemoAccount } from "../packages/seed/src/demo-account.ts";
import { compareInventory, designInventory, inventoryHtml } from "../scripts/design-inventory.mjs";
import { renderDesignMarkup } from "../scripts/render-design.mjs";
import { accessibilityViolations } from "./accessibility-helper.ts";
import {
	readInventory,
	secretsFor,
	skipUnlessMacScreenshot,
	viewports,
	waitForHydration,
	waitForScreenFonts,
} from "./support.ts";
import {
	deleteWorkspaceAccount,
	expect,
	generatedEvents,
	installLocalFonts,
	openWorkspace,
	test,
	type WorkspaceUser,
} from "./workspace.ts";

const mission = "Never run out of a top-20 product and keep stock under 30 days of cover.";
const marketingReply = "Ad spend this week is $262 at a 3.4 return. The best ad set is Prints, lookalike.";
const revisingCopy = 'Master is writing a new proposal. The squad stays on "Mission pending".';
const emptyInbox = "Nothing waiting. Your squads are working inside their limits.";
const settled = { timeout: 15_000 };

// Requests parked here are still open. Abort them before unrouteAll, which would send them on.
// This worker reuses one account, and the next test reseeds it before it reads the badge.
const parkedRoutes = new Set<Route>();

async function abortParkedRoutes(): Promise<void> {
	const routes = [...parkedRoutes];
	parkedRoutes.clear();
	for (const route of routes) await route.abort().catch(() => undefined);
}

test.afterEach(async ({ page }) => {
	await abortParkedRoutes();
	await page.unrouteAll({ behavior: "ignoreErrors" });
});

async function fetchParked(route: Route) {
	parkedRoutes.add(route);
	try {
		const response = await route.fetch();
		if (!parkedRoutes.has(route)) return;
		return response;
	} catch (error) {
		if (!parkedRoutes.has(route)) return;
		parkedRoutes.delete(route);
		throw error;
	}
}

async function settleParked(route: Route, settle: () => Promise<void>) {
	if (!parkedRoutes.has(route)) return;
	parkedRoutes.delete(route);
	try {
		await settle();
	} catch (error) {
		const message = error instanceof Error ? error.message : "";
		if (
			message.includes("already handled") ||
			message.includes("has been closed") ||
			message.includes("Target closed")
		) {
			return;
		}
		throw error;
	}
}

test("the overview shows the greeting, six tiles, fourteen bars, the inbox and five cards", async ({
	page,
	workspaceUser,
}) => {
	await openWorkspace(page, workspaceUser);
	await expect(page.getByRole("heading", { name: "Good morning, Moe" })).toBeVisible();
	await expect(page.getByText("Last 7 days across the store and your squads. Figures are demo data.")).toBeVisible();
	await expect(page.locator("main [data-loop='kpis'] > div")).toHaveCount(6);
	await expect(
		page.locator("main section[aria-label='Revenue'] [data-loop='bars']").first().locator("> div"),
	).toHaveCount(14);
	await expect(page.locator("main [data-loop='missionProposals'] > div")).toHaveCount(1);
	await expect(page.locator("main [data-loop='approvals'] > div")).toHaveCount(3);
	await expect(page.locator("main [data-loop='agents'] > button")).toHaveCount(5);
	expect(await page.locator("main [data-loop='kpis'] > div").count()).toBeGreaterThan(1);
	expect(await page.locator("main [data-loop='agents'] > button").count()).toBeGreaterThan(1);
});

test("the tile shows the computed 331 and the pill shows 4 of 5 squads online", async ({ page, workspaceUser }) => {
	await openWorkspace(page, workspaceUser);
	const tasks = page.locator("main [data-loop='kpis'] > div").filter({ hasText: "Tasks done by squads" });
	await expect(tasks).toContainText("331");
	await expect(tasks).toContainText("This week");
	await expect(page.locator("main [data-design-contrast='overview-online-pill']")).toHaveText("4 of 5 squads online");
	await expect(page.locator("main [data-loop='kpis']")).toContainText("$8,420");
	await expect(page.locator("main [data-loop='kpis']")).toContainText("34h");
});

test("approve adds one task, sets the last line, and writes the Mandate", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	await openWorkspace(page, workspaceUser);
	await expect(page.locator("[data-if='dockUnread']")).toHaveText("4");
	const posted = decisionDone(page, "ap1");
	await page.locator("main").getByRole("button", { name: "Approve", exact: true }).first().click();
	await expect(
		page.locator("main [data-loop='kpis'] > div").filter({ hasText: "Tasks done by squads" }),
	).toContainText("332", settled);
	await expect(page.locator("[data-if='dockUnread']")).toHaveText("3", settled);
	const support = page.locator("main [data-loop='agents'] > button").filter({ hasText: "Support" });
	await expect(support).toContainText("97");
	await expect(support).toContainText("Refund $42 on #A-1012 (approved)");
	await expect(page.locator("main").getByRole("button", { name: "Approve", exact: true })).toHaveCount(2);
	await posted;
	const events = await generatedEvents(accountId);
	expect(events.map((event) => event.kind)).toEqual(["Approval"]);
	const mandate = await mandateFor(accountId, "ap1");
	expect(mandate.row).not.toBeNull();
	expect(mandate.row?.ruleId).toBe("r1");
	expect(mandate.row?.limitValue).toBe(50);
	expect(mandate.row?.saidYes).toBe("Moe");
	expect(mandate.row?.policyVersion).toBe(mandate.version);
	expect(await mandateFor(accountId, "ap3")).toMatchObject({ row: null });
});

test("decline removes the approval and changes no agent", async ({ page, workspaceUser, accountId }) => {
	await openWorkspace(page, workspaceUser);
	const marketing = page.locator("main [data-loop='agents'] > button").filter({ hasText: "Marketing" });
	await expect(marketing).toContainText("38");
	await expect(marketing).toContainText("Asked to raise the prints ad set to $60 a day");
	const card = page
		.locator("main [data-loop='approvals'] > div")
		.filter({ hasText: "Raise prints ad set to $60 a day" });
	await card.getByRole("button", { name: "Decline", exact: true }).focus();
	const posted = decisionDone(page, "ap2");
	await page.keyboard.press("Enter");
	await expect(card).toHaveCount(0, settled);
	await expect(marketing).toContainText("38");
	await expect(marketing).toContainText("Asked to raise the prints ad set to $60 a day");
	await posted;
	const events = await generatedEvents(accountId);
	expect(events.map((event) => event.kind)).toEqual(["Declined"]);
	expect((await mandateFor(accountId, "ap2")).row).toBeNull();
});

test("an empty inbox shows the nothing waiting text and no badge", async ({ page, workspaceUser }) => {
	// Four writes share one test database. Each write may take the full 15 second bound.
	test.setTimeout(90_000);
	await openWorkspace(page, workspaceUser);
	const missionPost = decisionDone(page, "mp-inventory");
	await page.locator("main").getByRole("button", { name: "Approve mission" }).click();
	await missionPost;
	await expect(page.locator("[data-if='dockUnread']")).toHaveText("3", settled);
	await expect(page.locator("main").getByRole("button", { name: "Decline", exact: true })).toHaveCount(3);
	for (const left of [2, 1, 0]) {
		const posted = decisionDone(page, '"ap');
		await page.locator("main").getByRole("button", { name: "Decline", exact: true }).first().click();
		await expect(page.locator("main").getByRole("button", { name: "Decline", exact: true })).toHaveCount(
			left,
			settled,
		);
		await posted;
	}
	await expect(page.locator("main")).toContainText(emptyInbox, settled);
	await expect(page.locator("main section[aria-label='Needs you'] h2 + span")).toHaveText("0");
	await expect(page.locator("[data-if='dockUnread']")).toHaveCount(0);
});

test("approve mission sets the mission, the targets and zero contribution", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	await openWorkspace(page, workspaceUser);
	const posted = decisionDone(page, "mp-inventory");
	await page.locator("main").getByRole("button", { name: "Approve mission" }).click();
	const inventory = page.locator("main [data-loop='agents'] > button").filter({ hasText: "Inventory" });
	await expect(inventory).toContainText(mission, settled);
	await expect(inventory).toContainText("0% done");
	await expect(inventory).toContainText("31");
	await expect(page.locator("main [data-loop='missionProposals'] > div")).toHaveCount(0);
	await posted;
	const events = await generatedEvents(accountId);
	expect(events).toEqual([]);
	const agent = await agentFor(accountId, "inventory");
	expect(agent.tasks).toBe(31);
	expect(agent.contribution).toBe(0);
	expect(agent.mission).toBe(mission);
	expect(agent.targets).toEqual([
		["Stock-outs", "—", "0"],
		["Days of stock", "—", "under 30"],
		["Reorders approved in time", "—", "100%"],
	]);
});

test("ask for another shows the revising text and lowers the count", async ({ page, workspaceUser }) => {
	await openWorkspace(page, workspaceUser);
	await expect(page.locator("[data-if='dockUnread']")).toHaveText("4");
	const posted = decisionDone(page, "mp-inventory");
	await page.locator("main").getByRole("button", { name: "Ask for another" }).click();
	await expect(page.locator("main")).toContainText(revisingCopy, settled);
	await expect(page.locator("main")).toContainText("Revised mission on its way");
	await expect(page.locator("main [data-loop='missionProposals'] > div")).toHaveCount(1);
	await expect(page.locator("[data-if='dockUnread']")).toHaveText("3");
	await expect(page.locator("main section[aria-label='Needs you'] h2 + span")).toHaveText("3");
	await posted;
});

test("a held Approve changes the card and the badge at the click", async ({ page, workspaceUser }) => {
	const held = await clickHeld(page, workspaceUser, () =>
		refundCard(page).getByRole("button", { name: "Approve", exact: true }).click(),
	);
	await expect(refundCard(page)).toHaveCount(0);
	await expect(dockBadge(page)).toHaveText("3");
	await expect(inboxCount(page)).toHaveText("3");
	await expect.poll(held.posts).toBe(1);
});

test("a held Decline changes the card and the badge at the click", async ({ page, workspaceUser }) => {
	const held = await clickHeld(page, workspaceUser, () =>
		printsCard(page).getByRole("button", { name: "Decline", exact: true }).click(),
	);
	await expect(printsCard(page)).toHaveCount(0);
	await expect(dockBadge(page)).toHaveText("3");
	await expect(inboxCount(page)).toHaveText("3");
	await expect.poll(held.posts).toBe(1);
});

test("a held Approve mission changes the card and the badge at the click", async ({ page, workspaceUser }) => {
	const held = await clickHeld(page, workspaceUser, () =>
		page.locator("main").getByRole("button", { name: "Approve mission", exact: true }).click(),
	);
	await expect(page.locator("main [data-loop='missionProposals'] > div")).toHaveCount(0);
	await expect(page.locator("main [data-loop='agents'] > button").filter({ hasText: "Inventory" })).toContainText(
		mission,
	);
	await expect(dockBadge(page)).toHaveText("3");
	await expect.poll(held.posts).toBe(1);
});

test("a held Ask for another changes the card and the badge at the click", async ({ page, workspaceUser }) => {
	const held = await clickHeld(page, workspaceUser, () =>
		page.locator("main").getByRole("button", { name: "Ask for another", exact: true }).click(),
	);
	await expect(page.locator("main")).toContainText("Revised mission on its way");
	await expect(page.locator("main")).toContainText(revisingCopy);
	await expect(dockBadge(page)).toHaveText("3");
	await expect.poll(held.posts).toBe(1);
});

test("a second card is sent after the first, in click order", async ({ page, workspaceUser }) => {
	await openWorkspace(page, workspaceUser);
	const held = await gatePosts(page, false);
	await refundCard(page).getByRole("button", { name: "Approve", exact: true }).click();
	await printsCard(page).getByRole("button", { name: "Decline", exact: true }).click();
	await expect(refundCard(page)).toHaveCount(0);
	await expect(printsCard(page)).toHaveCount(0);
	await expect(dockBadge(page)).toHaveText("2");
	await expect.poll(held.posts).toBe(1);
	const secondDone = decisionDone(page, "ap2");
	held.release();
	await expect.poll(held.posts, settled).toBe(2);
	expect(held.bodies[0]).toContain("ap1");
	expect(held.bodies[1]).toContain("ap2");
	await secondDone;
});

test("queued cards and counts survive leaving and returning to overview", async ({ page, workspaceUser }) => {
	await openWorkspace(page, workspaceUser);
	const held = await gatePosts(page, false);
	await refundCard(page).getByRole("button", { name: "Approve", exact: true }).click();
	await printsCard(page).getByRole("button", { name: "Decline", exact: true }).click();
	await expect.poll(held.posts).toBe(1);
	await page.locator("main").getByRole("button", { name: "See squad traffic" }).click();
	await expect(page).toHaveURL(/\/traffic$/);
	await page.getByRole("button", { name: "Overview", exact: true }).click();
	await expect(refundCard(page)).toHaveCount(0);
	await expect(printsCard(page)).toHaveCount(0);
	await expect(inboxCount(page)).toHaveText("2");
	await expect(dockBadge(page)).toHaveText("2");
	const secondDone = decisionDone(page, "ap2");
	held.release();
	await secondDone;
});

test("navigation frame reads update the count after another tab decides", async ({ page, browser, workspaceUser }) => {
	await openWorkspace(page, workspaceUser);
	await expect(inboxCount(page)).toHaveText("4");
	await expect(dockBadge(page)).toHaveText("4");
	const otherContext = await browser.newContext({
		baseURL: "http://localhost:3000",
		storageState: await page.context().storageState(),
	});
	try {
		const otherPage = await otherContext.newPage();
		await installLocalFonts(otherPage);
		await otherPage.goto("/overview");
		await waitForHydration(otherPage);
		const decided = decisionDone(otherPage, "ap1");
		await refundCard(otherPage).getByRole("button", { name: "Approve", exact: true }).click();
		await decided;
		await expect(
			otherPage.locator("main [data-loop='kpis'] > div").filter({ hasText: "Tasks done by squads" }),
		).toContainText("332", settled);
		await page.getByRole("button", { name: "Squad traffic", exact: true }).click();
		await expect(page).toHaveURL(/\/traffic$/);
		await expect(page.locator("[data-if='isOverview']")).toHaveCount(0);
		await page.getByRole("button", { name: "Overview", exact: true }).click();
		await expect(page).toHaveURL(/\/overview$/);
		await expect(page.locator("[data-if='isOverview']")).toHaveCount(1, settled);
		await expect(refundCard(page)).toHaveCount(0);
		await expect(inboxCount(page)).toHaveText("3");
		await expect(dockBadge(page)).toHaveText("3");
	} finally {
		await otherContext.close();
	}
});

test("a rejected decision restores the badge after leaving overview", async ({ page, workspaceUser }) => {
	test.setTimeout(90_000);
	await openWorkspace(page, workspaceUser);
	await expect(dockBadge(page)).toHaveText("4");
	let held = false;
	let heldRoute: Route | undefined;
	const rejectRefund = async (route: Route) => {
		const request = route.request();
		if (request.method() !== "POST" || !(request.postData() ?? "").includes("ap1")) {
			await route.continue();
			return;
		}
		held = true;
		heldRoute = route;
		parkedRoutes.add(route);
	};
	const release = async () => {
		const route = heldRoute;
		heldRoute = undefined;
		if (!route) return;
		await settleParked(route, () => route.fulfill({ status: 500, contentType: "text/plain", body: "no" }));
	};
	await page.route("**/_serverFn/**", rejectRefund);
	try {
		await refundCard(page).getByRole("button", { name: "Approve", exact: true }).click();
		await expect.poll(() => held).toBe(true);
		await expect(dockBadge(page)).toHaveText("3");
		await page.locator("main").getByRole("button", { name: "See squad traffic" }).click();
		await expect(page).toHaveURL(/\/traffic$/);
		await expect(page.locator("[data-if='isOverview']")).toHaveCount(0);
		await expect(dockBadge(page)).toHaveText("3");
	} finally {
		try {
			await test.step(
				"release the rejected refund and wait for its frame read",
				async () => {
					const releasedAt = Date.now();
					const rejected = page.waitForResponse(
						(response) => {
							const request = response.request();
							return (
								request.method() === "POST" &&
								(request.postData() ?? "").includes("ap1") &&
								response.status() === 500
							);
						},
						{ timeout: 30_000 },
					);
					const refreshed = page.waitForResponse(
						async (response) => {
							const request = response.request();
							return (
								request.method() === "GET" &&
								request.url().includes("/_serverFn/") &&
								request.timing().startTime >= releasedAt &&
								response.ok() &&
								(await response.text()).includes('"approvalCount"')
							);
						},
						{ timeout: 30_000 },
					);
					await release();
					const responses = await Promise.all([rejected, refreshed]);
					for (const response of responses) expect(await response.finished()).toBeNull();
				},
				{ timeout: 30_000 },
			);
		} finally {
			await release();
			await abortParkedRoutes();
			await page.unroute("**/_serverFn/**", rejectRefund);
		}
	}
	await expect(dockBadge(page)).toHaveText("4", settled);
});

test("navigation frame reads update the count after another tab declines", async ({ page, workspaceUser }) => {
	await openWorkspace(page, workspaceUser);
	await expect(dockBadge(page)).toHaveText("4");
	await page.locator("main").getByRole("button", { name: "See squad traffic" }).click();
	await expect(page).toHaveURL(/\/traffic$/);
	const other = await page.context().newPage();
	try {
		await other.goto("/overview");
		await waitForHydration(other);
		const decided = decisionDone(other, "ap1");
		await refundCard(other).getByRole("button", { name: "Decline", exact: true }).click();
		await decided;
		await page.getByRole("button", { name: "Overview", exact: true }).click();
		await expect(refundCard(page)).toHaveCount(0, settled);
		await expect(inboxCount(page)).toHaveText("3", settled);
		await expect(dockBadge(page)).toHaveText("3", settled);
	} finally {
		await other.close();
	}
});

test("a held dock begin keeps the server count on traffic", async ({ page, workspaceUser }) => {
	test.setTimeout(90_000);
	await openWorkspace(page, workspaceUser);
	const held = await holdWorkspaceSend(page, "begin");
	try {
		await page.getByRole("button", { name: "Ask Master" }).click();
		await page.locator("#dock-input").fill("How did ads do this week?");
		await page.getByRole("button", { name: "Send", exact: true }).click();
		await expect.poll(held.held, { timeout: 20_000 }).toBe(true);
		await page.getByRole("button", { name: "Close chat" }).click();
		await approveRefundThenOpenTraffic(page);
	} finally {
		await held.finish();
	}
});

test("a held chat finish keeps the server count on traffic", async ({ page, workspaceUser }) => {
	test.setTimeout(90_000);
	await openWorkspace(page, workspaceUser);
	await page.getByRole("button", { name: "Chat with the master" }).click();
	await expect(page).toHaveURL(/\/chat$/);
	const held = await holdWorkspaceSend(page, "finish");
	try {
		await page.locator("#chat-input").fill("How did ads do this week?");
		await page.getByRole("button", { name: "Send", exact: true }).click();
		await expect.poll(held.held, { timeout: 20_000 }).toBe(true);
		await page.getByRole("button", { name: "Overview", exact: true }).click();
		await expect(page).toHaveURL(/\/overview$/);
		await approveRefundThenOpenTraffic(page);
	} finally {
		await held.finish();
	}
});

test("a double click approves once and the badge changes at the click", async ({ page, workspaceUser }) => {
	const held = await clickHeld(page, workspaceUser, () =>
		refundCard(page)
			.getByRole("button", { name: "Approve", exact: true })
			.evaluate((button) => {
				button.click();
				button.click();
			}),
	);
	await expect(refundCard(page)).toHaveCount(0);
	await expect(dockBadge(page)).toHaveText("3");
	await expect.poll(held.posts).toBe(1);
});

test("a failed write restores the server and the queued card still sends", async ({ page, workspaceUser }) => {
	await openWorkspace(page, workspaceUser);
	const held = await gatePosts(page, true);
	await refundCard(page).getByRole("button", { name: "Approve", exact: true }).click();
	await printsCard(page).getByRole("button", { name: "Decline", exact: true }).click();
	await expect(refundCard(page)).toHaveCount(0);
	await expect(printsCard(page)).toHaveCount(0);
	await expect(dockBadge(page)).toHaveText("2");
	await expect.poll(held.posts).toBe(1);
	const secondDone = decisionDone(page, "ap2");
	held.release();
	await expect(refundCard(page)).toHaveCount(1, settled);
	await expect(printsCard(page)).toHaveCount(0);
	await expect.poll(held.posts, settled).toBe(2);
	await expect(dockBadge(page)).toHaveText("3", settled);
	expect(held.bodies[0]).toContain("ap1");
	expect(held.bodies[1]).toContain("ap2");
	await secondDone;
});

test("an empty proposal mission shows an em dash", async ({ page, workspaceUser, accountId }) => {
	const postgres = openPostgres(secretsFor(["testDatabase"]).testDatabase);
	try {
		await postgres.db
			.update(schema.missionProposals)
			.set({ mission: "" })
			.where(eq(schema.missionProposals.accountId, accountId));
	} finally {
		await postgres.close();
	}
	await openWorkspace(page, workspaceUser);
	await expect(page.locator("main [data-loop='missionProposals']")).toContainText("—");
	await expect(page.locator("main")).not.toContainText("Your Master will propose one.");
});

test("see squad traffic and each card open their pages", async ({ page, workspaceUser }) => {
	await openWorkspace(page, workspaceUser);
	await page.locator("main").getByRole("button", { name: "See squad traffic" }).click();
	await expect(page).toHaveURL(/\/traffic$/);
	await expect(page).toHaveTitle("Agent traffic");
	for (const agent of ["orders", "support", "marketing", "finance", "inventory"]) {
		await page.getByRole("button", { name: "Overview" }).click();
		await expect(page).toHaveURL(/\/overview$/);
		const name = agent.charAt(0).toUpperCase() + agent.slice(1);
		await page.locator("main [data-loop='agents']").getByRole("button", { name }).click();
		await expect(page).toHaveURL(new RegExp(`/agents/${agent}$`));
		await expect(page).toHaveTitle("Agent dashboard");
	}
});

test("the overview matches the rendered design inventory", async ({ page, workspaceUser }) => {
	const section = overviewSection();
	expect(section.texts.length).toBeGreaterThan(1);
	expect(section.handlers.map((handler: { handler: string }) => handler.handler)).toContain("ap.approve");
	expect(section.loops.filter((loop: { list?: string }) => loop.list === "kpis").length).toBeGreaterThan(0);
	await openWorkspace(page, workspaceUser);
	const design = await designMain(page);
	const built = await sectionInventory(page, "main");
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
	expect(built.texts.filter((text: string) => text === "Approve").length).toBeGreaterThan(1);
});

test("the overview boxes match the rendered design at 1440 and 390", async ({ page, workspaceUser }) => {
	await openWorkspace(page, workspaceUser);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await waitForScreenFonts(page);
		const designPage = await openDesignOverview(page, viewport.width, viewport.height);
		try {
			await waitForScreenFonts(designPage);
			const design = await measureOverview(designPage);
			const built = await measureOverview(page);
			expectOverviewBoxes(built, design, viewport.name);
			await expectContents(designPage, viewport.name);
			await expectContents(page, viewport.name);
		} finally {
			await designPage.close();
		}
	}
});

test("the overview has no accessibility violations", async ({ page, workspaceUser }) => {
	await openWorkspace(page, workspaceUser);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		expect(await accessibilityViolations(page)).toEqual([]);
	}
});

test("the overview matches the macOS screenshot baselines", async ({ page, workspaceUser }) => {
	skipUnlessMacScreenshot();
	await openWorkspace(page, workspaceUser);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await waitForScreenFonts(page);
		await expect(page).toHaveScreenshot(`overview-${viewport.name}.png`, { fullPage: true });
	}
});

test("the side-by-side evidence shows the design and the build", async ({ page, workspaceUser }) => {
	test.skip(
		process.env.OVERVIEW_EVIDENCE !== "1" || process.platform !== "darwin",
		"Side-by-side evidence is captured once on macOS.",
	);
	const dir = ".no-mistakes/evidence/02-overview";
	mkdirSync(dir, { recursive: true });
	await openWorkspace(page, workspaceUser);
	for (const viewport of viewports) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await waitForScreenFonts(page);
		const build = await shot(page);
		const design = await designShot(page, viewport.width, viewport.height);
		await stitch(page, design, build, `${dir}/side-by-side-${viewport.name}.png`);
	}
});

test("a cached overview keeps the decision until the fresh read lands", async ({ page, workspaceUser }) => {
	test.setTimeout(90_000);
	await openWorkspace(page, workspaceUser);
	await refundCard(page).getByRole("button", { name: "Approve", exact: true }).click();
	await expect(tasksTile(page)).toContainText("332", settled);
	await expect(refundCard(page)).toHaveCount(0);
	await page.locator("main").getByRole("button", { name: "See squad traffic" }).click();
	await expect(page).toHaveURL(/\/traffic$/);
	await expect(page.locator("[data-if='isOverview']")).toHaveCount(0);
	await expect(dockBadge(page)).toHaveText("3");
	const held = await holdNextOverview(page);
	try {
		await page.getByRole("button", { name: "Overview", exact: true }).click();
		await expect(page).toHaveURL(/\/overview$/);
		await expect.poll(() => held.held(), { timeout: 20_000 }).toBe(true);
		await expect(refundCard(page)).toHaveCount(0);
		await expect(dockBadge(page)).toHaveText("3");
		// A blocking reload keeps Traffic up. A cached Overview that does paint must keep the decision.
		if ((await tasksTile(page).count()) > 0) {
			await expect(tasksTile(page)).toContainText("332");
			await expect(inboxCount(page)).toHaveText("3");
		}
		await held.release();
		await expect(refundCard(page)).toHaveCount(0);
		await expect(tasksTile(page)).toContainText("332", settled);
		await expect(dockBadge(page)).toHaveText("3");
		await expect(inboxCount(page)).toHaveText("3");
	} finally {
		await held.release();
		await abortParkedRoutes();
		await page.unroute("**/_serverFn/**").catch(() => undefined);
	}
});

test("a failed decision does not stay on the next account", async ({ page, workspaceUser }) => {
	test.setTimeout(90_000);
	const secrets = secretsFor(["secret", "testDatabase"]);
	const email = `sq-${randomUUID().slice(0, 8)}+clerk_test@example.com`;
	const password = `Ts${randomUUID().replaceAll("-", "")}Zq7`;
	const userId = await createClerkUser(secrets.secret, email, password);
	const accountId = `overview-b-${randomUUID().slice(0, 8)}`;
	const postgres = openPostgres(secrets.testDatabase);
	try {
		await replaceDemoAccount(postgres.db, accountId, userId);
	} finally {
		await postgres.close();
	}
	try {
		await openWorkspace(page, workspaceUser);
		await page.evaluate(() => {
			(window as unknown as { __tsDoc?: string }).__tsDoc = "same";
		});
		await page.clock.install();
		const held = await holdFailedRefresh(page);
		try {
			await refundCard(page).getByRole("button", { name: "Approve", exact: true }).click();
			await expect(dockBadge(page)).toHaveText("3");
			await expect.poll(() => held.held(), { timeout: 20_000 }).toBe(true);
			await page.clock.fastForward(30_000);
			await page.clock.resume();
			await switchAccount(page, email, password);
			await expect.poll(() => page.evaluate(() => (window as unknown as { __tsDoc?: string }).__tsDoc)).toBe("same");
			await expect(refundCard(page)).toHaveCount(1, settled);
			await expect(dockBadge(page)).toHaveText("4", settled);
			await expect(tasksTile(page)).toContainText("331", settled);
			await held.release();
			await expect(refundCard(page)).toHaveCount(1);
			await expect(dockBadge(page)).toHaveText("4");
			await expect(tasksTile(page)).toContainText("331");
		} finally {
			await held.release();
			await abortParkedRoutes();
			await page.unroute("**/_serverFn/**").catch(() => undefined);
		}
	} finally {
		await deleteWorkspaceAccount(accountId);
		await deleteClerkUser(secrets.secret, userId);
	}
});

test("a held chat finish still writes the reply after an approval", async ({ page, workspaceUser, accountId }) => {
	test.setTimeout(90_000);
	await openWorkspace(page, workspaceUser);
	await page.getByRole("button", { name: "Chat with the master" }).click();
	await expect(page).toHaveURL(/\/chat$/);
	const held = await holdWorkspaceSend(page, "finish");
	try {
		await page.locator("#chat-input").fill("How did ads do this week?");
		await page.getByRole("button", { name: "Send", exact: true }).click();
		await expect.poll(() => held.held(), { timeout: 20_000 }).toBe(true);
		await page.getByRole("button", { name: "Overview", exact: true }).click();
		await expect(page).toHaveURL(/\/overview$/);
		await refundCard(page).getByRole("button", { name: "Approve", exact: true }).click();
		await expect(tasksTile(page)).toContainText("332", settled);
		await held.finish();
		await expect(page.getByRole("region", { name: "Chat with the master" }).getByText(marketingReply)).toBeVisible(
			settled,
		);
		await expect(tasksTile(page)).toContainText("333", settled);
		const events = await generatedEvents(accountId);
		expect(events.map((event) => event.kind)).toContain("Result");
	} finally {
		await abortParkedRoutes();
		await page.unroute("**/_serverFn/**").catch(() => undefined);
	}
});

test("a lost approval keeps the screen when the frame and overview reads fail", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	test.setTimeout(90_000);
	await openWorkspace(page, workspaceUser);
	await refundCard(page).getByRole("button", { name: "Approve", exact: true }).click();
	await expect(tasksTile(page)).toContainText("332", settled);
	await expect(refundCard(page)).toHaveCount(0);
	await expect(inboxCount(page)).toHaveText("3", settled);
	const lost = await loseCommittedRefresh(page, "ap2");
	try {
		await printsCard(page).getByRole("button", { name: "Approve", exact: true }).click();
		await expect.poll(() => lost.failed(), { timeout: 20_000 }).toBe(true);
		await expect(page).toHaveURL(/\/overview$/);
		await expect(page.getByText("Something went wrong")).toHaveCount(0);
		await expect(page.locator("nav[aria-label='Workspace']")).toBeVisible();
		await expect(page.locator("[data-handler='ap.approve']")).toHaveCount(1);
		await expect(refundCard(page)).toHaveCount(0);
		await expect(printsCard(page)).toHaveCount(0);
		await expect(tasksTile(page)).toContainText("333");
		await expect(inboxCount(page)).toHaveText("2");
		await expect(dockBadge(page)).toHaveText("2");
		expect(await recoveryFlags(page)).toEqual({ frame: true, overview: true });
		expect((await mandateFor(accountId, "ap2")).row).not.toBeNull();
		const before = { frame: lost.reads.frame, overview: lost.reads.overview };
		await page.evaluate(async () => {
			const router = (
				window as unknown as { __TSR_ROUTER__?: { invalidate: (options: { sync: boolean }) => Promise<void> } }
			).__TSR_ROUTER__;
			if (!router) throw new Error("Router is missing.");
			await router.invalidate({ sync: true });
		});
		await expect.poll(() => recoveryFlags(page), { timeout: 20_000 }).toEqual({ frame: false, overview: false });
		expect(lost.reads.frame).toBe(before.frame + 1);
		expect(lost.reads.overview).toBe(before.overview + 1);
		await expect(tasksTile(page)).toContainText("333");
		await expect(inboxCount(page)).toHaveText("2");
		await expect(dockBadge(page)).toHaveText("2");
		await expect(printsCard(page)).toHaveCount(0);
		await expect(page.locator("[data-handler='ap.approve']")).toHaveCount(1);
	} finally {
		await abortParkedRoutes();
		await page.unroute("**/_serverFn/**").catch(() => undefined);
	}
});

test("a failed frame refresh keeps the squads screen", async ({ page, workspaceUser }) => {
	test.setTimeout(90_000);
	await openWorkspace(page, workspaceUser);
	const held = await failFrameRefresh(page);
	try {
		await page.getByRole("button", { name: "Squads", exact: true }).click();
		await expect(page).toHaveURL(/\/agents$/);
		await expect(page.getByRole("heading", { name: "Squads", exact: true })).toBeVisible();
		await expect(page.getByText("Something went wrong")).toHaveCount(0);
		await expect(page.locator("nav[aria-label='Workspace']")).toBeVisible();
		await expect.poll(() => recoveryFlags(page), { timeout: 20_000 }).toEqual({ frame: true, overview: false });
		const before = held.reads.frame;
		held.allow();
		await page.getByRole("button", { name: "Squad traffic", exact: true }).click();
		await expect(page).toHaveURL(/\/traffic$/);
		await expect.poll(() => recoveryFlags(page), { timeout: 20_000 }).toEqual({ frame: false, overview: false });
		expect(held.reads.frame).toBe(before + 1);
		await expect(page.getByText("Something went wrong")).toHaveCount(0);
		await expect(page.locator("nav[aria-label='Workspace']")).toBeVisible();
	} finally {
		await abortParkedRoutes();
		await page.unroute("**/_serverFn/**").catch(() => undefined);
	}
});

function tasksTile(page: Page) {
	return page.locator("main [data-loop='kpis'] > div").filter({ hasText: "Tasks done by squads" });
}

async function holdNextOverview(page: Page) {
	const state = { held: false };
	let parked: { route: Route; response: Awaited<ReturnType<Route["fetch"]>>; body: string } | undefined;
	await page.route("**/_serverFn/**", async (route) => {
		const request = route.request();
		if (request.method() !== "GET" || state.held || parked) {
			await route.continue();
			return;
		}
		const response = await fetchParked(route);
		if (!response || !parkedRoutes.has(route)) return;
		const body = await response.text();
		if (!parkedRoutes.has(route)) return;
		if (!body.includes("Tasks done by squads")) {
			await settleParked(route, () => route.fulfill({ response, body }));
			return;
		}
		state.held = true;
		parked = { route, response, body };
	});
	return {
		held: () => state.held,
		release: async () => {
			const current = parked;
			if (!current) return;
			parked = undefined;
			await settleParked(current.route, () =>
				current.route.fulfill({ response: current.response, body: current.body }),
			);
		},
	};
}

async function holdFailedRefresh(page: Page) {
	const state = { held: false, posts: 0, gets: 0 };
	const waiting: { route: Route; response: Awaited<ReturnType<Route["fetch"]>> }[] = [];
	await page.route("**/_serverFn/**", async (route) => {
		const request = route.request();
		const body = request.postData() ?? "";
		if (request.method() === "POST" && body.includes("ap1")) {
			state.posts += 1;
			if (state.posts === 1) {
				await route.fulfill({ status: 500, contentType: "text/plain", body: "no" });
				return;
			}
		}
		if (request.method() === "GET" && state.posts > 0 && state.gets < 2) {
			state.gets += 1;
			state.held = true;
			const response = await fetchParked(route);
			if (!response || !parkedRoutes.has(route)) return;
			waiting.push({ route, response });
			return;
		}
		await route.continue();
	});
	return {
		held: () => state.held,
		release: async () => {
			const routes = waiting.splice(0);
			for (const item of routes) {
				await settleParked(item.route, () => item.route.fulfill({ response: item.response }));
			}
		},
	};
}

function recoveryFlags(page: Page): Promise<{ frame: boolean; overview: boolean }> {
	return page.evaluate(async () => {
		const frame = await import("/src/" + "workspace/frame-load.ts");
		const overview = await import("/src/" + "screens/overview/load.ts");
		return { frame: frame.frameNeedsRead(), overview: overview.overviewNeedsRead() };
	});
}

async function loseCommittedRefresh(page: Page, id: string) {
	const reads = { frame: 0, overview: 0 };
	let lost = false;
	let failedFrame = false;
	let failedOverview = false;
	await page.route("**/_serverFn/**", async (route) => {
		const request = route.request();
		const body = request.postData() ?? "";
		if (request.method() === "POST" && body.includes(id) && !lost) {
			lost = true;
			const response = await fetchParked(route);
			if (!response || !parkedRoutes.has(route)) return;
			await response.text();
			if (!parkedRoutes.has(route)) return;
			await settleParked(route, () => route.fulfill({ status: 500, contentType: "text/plain", body: "lost" }));
			return;
		}
		if (request.method() !== "GET") {
			await route.continue();
			return;
		}
		const response = await fetchParked(route);
		if (!response || !parkedRoutes.has(route)) return;
		const text = await response.text();
		if (!parkedRoutes.has(route)) return;
		const kind = readKind(text);
		if (kind === "frame") reads.frame += 1;
		if (kind === "overview") reads.overview += 1;
		if (lost && kind === "frame" && !failedFrame) {
			failedFrame = true;
			await settleParked(route, () => route.fulfill({ status: 500, contentType: "text/plain", body: "no" }));
			return;
		}
		if (lost && kind === "overview" && !failedOverview) {
			failedOverview = true;
			await settleParked(route, () => route.fulfill({ status: 500, contentType: "text/plain", body: "no" }));
			return;
		}
		await settleParked(route, () => route.fulfill({ response, body: text }));
	});
	return {
		reads,
		failed: () => lost && failedFrame && failedOverview,
	};
}

async function failFrameRefresh(page: Page) {
	const reads = { frame: 0 };
	let fail = true;
	await page.route("**/_serverFn/**", async (route) => {
		const request = route.request();
		if (request.method() !== "GET") {
			await route.continue();
			return;
		}
		const response = await fetchParked(route);
		if (!response || !parkedRoutes.has(route)) return;
		const text = await response.text();
		if (!parkedRoutes.has(route)) return;
		if (readKind(text) !== "frame") {
			await settleParked(route, () => route.fulfill({ response, body: text }));
			return;
		}
		reads.frame += 1;
		if (fail) {
			await settleParked(route, () => route.fulfill({ status: 500, contentType: "text/plain", body: "no" }));
			return;
		}
		await settleParked(route, () => route.fulfill({ response, body: text }));
	});
	return {
		reads,
		allow: () => {
			fail = false;
		},
	};
}

function readKind(text: string): "frame" | "overview" | "other" {
	if (text.includes('"approvalCount"')) return "frame";
	if (text.includes("Tasks done by squads")) return "overview";
	return "other";
}

type BrowserSignIn = {
	status: string | null;
	createdSessionId: string | null;
	create: (params: { identifier: string }) => Promise<BrowserSignIn>;
	attemptFirstFactor: (params: { strategy: "password"; password: string }) => Promise<BrowserSignIn>;
	prepareSecondFactor: (params: { strategy: "email_code" }) => Promise<BrowserSignIn>;
	attemptSecondFactor: (params: { strategy: "email_code"; code: string }) => Promise<BrowserSignIn>;
};

async function switchAccount(page: Page, email: string, password: string) {
	await page.evaluate(
		async ({ email, password }) => {
			const clerk = (
				window as unknown as {
					Clerk?: {
						signOut: (callback?: () => void) => Promise<void>;
						setActive: (params: { session: string; navigate: () => Promise<void> }) => Promise<void>;
						client?: { signIn: BrowserSignIn };
					};
				}
			).Clerk;
			if (!clerk?.client?.signIn) {
				throw new Error("Clerk is not loaded.");
			}
			await clerk.signOut(() => undefined);
			const started = await clerk.client.signIn.create({ identifier: email });
			let attempted = await started.attemptFirstFactor({ strategy: "password", password });
			if (attempted.status === "needs_client_trust") {
				await attempted.prepareSecondFactor({ strategy: "email_code" });
				attempted = await attempted.attemptSecondFactor({ strategy: "email_code", code: "424242" });
			}
			if (attempted.status !== "complete" || !attempted.createdSessionId) {
				throw new Error(`Sign-in status ${attempted.status ?? "empty"}.`);
			}
			await clerk.setActive({
				session: attempted.createdSessionId,
				navigate: async () => undefined,
			});
		},
		{ email, password },
	);
	if (!page.url().endsWith("/overview")) {
		await page.evaluate(() => {
			const index = Number((history.state as { __TSR_index?: number } | null)?.__TSR_index ?? 0) + 1;
			const key = `overview-${index}`;
			history.pushState({ key, __TSR_key: key, __TSR_index: index }, "", "/overview");
		});
	}
	await expect(page).toHaveURL(/\/overview$/);
}

async function createClerkUser(secret: string, email: string, password: string) {
	const response = await fetch("https://api.clerk.com/v1/users", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${secret}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			email_address: [email],
			password,
			skip_password_checks: true,
		}),
	});
	if (!response.ok) {
		throw new Error(`Clerk create user failed with status ${response.status}.`);
	}
	const body = (await response.json()) as { id?: string };
	if (!body.id) {
		throw new Error("Clerk create user returned no id.");
	}
	return body.id;
}

async function deleteClerkUser(secret: string, userId: string) {
	if (userId.length === 0) {
		return;
	}
	const response = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
		method: "DELETE",
		headers: { Authorization: `Bearer ${secret}` },
	});
	if (!response.ok && response.status !== 404) {
		throw new Error(`Clerk delete user failed with status ${response.status}.`);
	}
}

function overviewSection() {
	const source = readFileSync(new URL("../design/Main.dc.html", import.meta.url), "utf8");
	const start = source.indexOf("<!-- ============ OVERVIEW ============ -->");
	const end = source.indexOf("<!-- ============ CHAT ============ -->");
	if (start < 0 || end < start) {
		throw new Error("The OVERVIEW section is missing.");
	}
	return designInventory("Main.dc.html", `<x-dc>${source.slice(start, end)}</x-dc>`);
}

function identities(handlers: { tag: string; event: string; handler: string }[]) {
	return handlers.map((handler) => `${handler.tag}|${handler.event}|${handler.handler}`).sort();
}

async function sectionInventory(page: Page, selector: string) {
	const html = await page.locator(selector).evaluate((element) => element.outerHTML);
	return inventoryHtml(html);
}

async function designMain(page: Page) {
	const canvas = await page.context().newPage();
	try {
		const html = await renderDesignMarkup(canvas, readInventory("Main"), { view: "overview", dockOpen: false });
		await canvas.setContent(html);
		return await sectionInventory(canvas, "main");
	} finally {
		await canvas.close();
	}
}

async function openDesignOverview(page: Page, width: number, height: number) {
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
	const body = await renderDesignMarkup(canvas, readInventory("Main"), { view: "overview", dockOpen: false });
	const source = readFileSync(new URL("../design/Main.dc.html", import.meta.url), "utf8");
	const css = source.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
	await canvas.setContent(
		`<!doctype html><html lang="en"><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"><style>${css}x-dc{display:contents}</style></head><body>${body}</body></html>`,
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

type OverviewBoxes = Awaited<ReturnType<typeof measureOverview>>;

function expectNear(actual: number, expected: number, label: string) {
	expect(Math.abs(actual - expected), `${label}: build ${actual}, design ${expected}`).toBeLessThanOrEqual(0.5);
}

function expectOverviewBoxes(built: OverviewBoxes, design: OverviewBoxes, name: string) {
	expect(design.tiles.length).toBeGreaterThan(1);
	expect(design.bars.length).toBeGreaterThan(1);
	expect(design.cards.length).toBeGreaterThan(1);
	expect(built.tiles.length).toBe(design.tiles.length);
	expect(built.bars.length).toBe(design.bars.length);
	expect(built.cards.length).toBe(design.cards.length);
	expect(design.trackHeight).toBeGreaterThan(100);
	for (const [index, tile] of built.tiles.entries()) {
		expectBox(tile, design.tiles[index], `${name} tile ${index}`);
	}
	for (const [index, bar] of built.bars.entries()) {
		expectBox(bar, design.bars[index], `${name} bar ${index}`);
	}
	for (const [index, card] of built.cards.entries()) {
		expectBox(card, design.cards[index], `${name} card ${index}`);
	}
	expectNear(built.trackHeight, design.trackHeight, `${name} bar track height`);
	expectNear(built.tileGap, design.tileGap, `${name} tile gap`);
	expectNear(built.cardGap, design.cardGap, `${name} card gap`);
}

function expectBox(
	actual: { x: number; y: number; width: number } | undefined,
	expected: { x: number; y: number; width: number } | undefined,
	label: string,
) {
	expectNear(actual?.width ?? 0, expected?.width ?? 0, `${label} width`);
	expectNear(actual?.x ?? 0, expected?.x ?? 0, `${label} x`);
	expectNear(actual?.y ?? 0, expected?.y ?? 0, `${label} y`);
}

async function expectContents(page: Page, name: string) {
	const displays = await page.evaluate(() =>
		[...document.querySelectorAll("main [data-loop], main [data-if]")].map((node) => getComputedStyle(node).display),
	);
	expect(displays.length, `${name} loop wrappers`).toBeGreaterThan(1);
	for (const display of displays) expect(display, `${name} display`).toBe("contents");
}

async function measureOverview(page: Page) {
	return page.evaluate(() => {
		const boxOf = (element: Element) => {
			const box = element.getBoundingClientRect();
			return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
		};
		const tiles = [...document.querySelectorAll("main [data-loop='kpis'] > div")];
		const bars = [...document.querySelectorAll("main section[aria-label='Revenue'] [data-loop='bars']")].flatMap(
			(loop) =>
				loop === document.querySelector("main section[aria-label='Revenue'] [data-loop='bars']")
					? [...loop.children]
					: [],
		);
		const cards = [...document.querySelectorAll("main [data-loop='agents'] > button")];
		const track = document.querySelector("main section[aria-label='Revenue'] [data-loop='bars']")?.parentElement;
		const tileGap = tiles.length > 1 ? boxOf(tiles[1] ?? tiles[0]).x - boxOf(tiles[0]).right : 0;
		const cardGap = cards.length > 1 ? boxOf(cards[1] ?? cards[0]).x - boxOf(cards[0]).right : 0;
		return {
			tiles: tiles.map(boxOf),
			bars: bars.map(boxOf),
			cards: cards.map(boxOf),
			trackHeight: track ? boxOf(track).height : 0,
			tileGap,
			cardGap,
		};
	});
}

async function shot(page: Page) {
	return page.screenshot({ fullPage: true, animations: "disabled", caret: "hide", scale: "css" });
}

async function designShot(page: Page, width: number, height: number) {
	const canvas = await openDesignOverview(page, width, height);
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

function refundCard(page: Page) {
	return page.locator("main [data-loop='approvals'] > div").filter({ hasText: "Refund $42" });
}

function printsCard(page: Page) {
	return page.locator("main [data-loop='approvals'] > div").filter({ hasText: "Raise prints" });
}

function dockBadge(page: Page) {
	return page.locator("[data-if='dockUnread']");
}

function inboxCount(page: Page) {
	return page.locator("main section[aria-label='Needs you'] h2 + span");
}

function decisionDone(page: Page, id: string): Promise<unknown> {
	return page.waitForResponse((response) => {
		const request = response.request();
		return (
			request.method() === "POST" &&
			request.url().startsWith("http://localhost:3000") &&
			(request.postData() ?? "").includes(id) &&
			response.ok()
		);
	}, settled);
}

async function gatePosts(page: Page, failFirst: boolean) {
	const bodies: string[] = [];
	const waiting: Route[] = [];
	let failed: Route | undefined;
	let open = false;
	await page.route("**/*", async (route) => {
		const request = route.request();
		if (request.method() !== "POST" || !request.url().startsWith("http://localhost:3000")) {
			await route.continue();
			return;
		}
		bodies.push(request.postData() ?? "");
		const hold = !open && ((failFirst && bodies.length === 1) || !failFirst);
		if (hold) {
			if (failFirst) failed = route;
			waiting.push(route);
			parkedRoutes.add(route);
			return;
		}
		await route.continue();
	});
	return {
		bodies,
		posts: () => bodies.length,
		release() {
			open = true;
			const routes = waiting.splice(0);
			for (const route of routes) parkedRoutes.delete(route);
			void releaseGatePosts(routes, failed);
		},
	};
}

async function releaseGatePosts(routes: Route[], failed: Route | undefined) {
	for (const route of routes) {
		try {
			if (route === failed) await route.fulfill({ status: 500, contentType: "text/plain", body: "no" });
			else await route.continue();
		} catch (error) {
			const message = error instanceof Error ? error.message : "";
			if (
				message.includes("already handled") ||
				message.includes("has been closed") ||
				message.includes("Target closed")
			) {
				continue;
			}
			throw error;
		}
	}
}

async function holdWorkspaceSend(page: Page, step: "begin" | "finish") {
	const state = { sends: 0, held: false };
	let finishRequest: Request | undefined;
	const waiting: Route[] = [];
	const target = step === "begin" ? 1 : 2;
	await page.route("**/_serverFn/**", async (route) => {
		const request = route.request();
		const body = request.postData() ?? "";
		if (request.method() !== "POST") {
			await route.continue();
			return;
		}
		if (body.includes("ap1")) {
			await route.continue();
			return;
		}
		state.sends += 1;
		if (state.sends === 2) finishRequest = request;
		if (state.sends === target) {
			state.held = true;
			waiting.push(route);
			parkedRoutes.add(route);
			return;
		}
		await route.continue();
	});
	return {
		held: () => state.held,
		finish: async () => {
			const finished = page.waitForResponse((response) => response.request() === finishRequest, {
				timeout: 30_000,
			});
			const routes = waiting.splice(0);
			for (const route of routes) parkedRoutes.delete(route);
			for (const route of routes) await route.continue().catch(() => undefined);
			try {
				await test.step(
					"wait for the released send and its frame refresh",
					async () => {
						const response = await finished;
						expect(response.ok()).toBe(true);
						expect(await response.finished()).toBeNull();
						const closedDock = page.locator("button[data-handler='toggleDock'][aria-expanded='false']");
						if (await closedDock.count()) await closedDock.click();
						await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled({
							timeout: 30_000,
						});
					},
					{ timeout: 30_000 },
				);
			} finally {
				await abortParkedRoutes();
				await page.unroute("**/_serverFn/**");
			}
		},
	};
}

async function approveRefundThenOpenTraffic(page: Page) {
	await refundCard(page).getByRole("button", { name: "Approve", exact: true }).click();
	await expect(
		page.locator("main [data-loop='kpis'] > div").filter({ hasText: "Tasks done by squads" }),
	).toContainText("332", settled);
	await expect(inboxCount(page)).toHaveText("3", settled);
	await expect(dockBadge(page)).toHaveText("3", settled);
	await page.locator("main").getByRole("button", { name: "See squad traffic" }).click();
	await expect(page).toHaveURL(/\/traffic$/);
	await expect(page.locator("[data-if='isOverview']")).toHaveCount(0);
	await expect(dockBadge(page)).toHaveText("3");
}

async function clickHeld(page: Page, user: WorkspaceUser, click: () => Promise<void>) {
	await openWorkspace(page, user);
	const held = await gatePosts(page, false);
	await click();
	return held;
}

async function mandateFor(accountId: string, approvalId: string) {
	const { secretsFor } = await import("./support.ts");
	const secrets = secretsFor(["testDatabase"]);
	const postgres = openPostgres(secrets.testDatabase);
	try {
		const rows = await postgres.db
			.select()
			.from(schema.mandates)
			.where(and(eq(schema.mandates.accountId, accountId), eq(schema.mandates.approvalId, approvalId)));
		const rules = await postgres.db
			.select()
			.from(schema.rules)
			.where(eq(schema.rules.accountId, accountId))
			.orderBy(asc(schema.rules.sortOrder));
		return {
			row: rows[0] ?? null,
			version: policyVersion(
				rules.map((rule) => ({
					id: rule.id,
					when: rule.ruleWhen,
					agent: rule.agent,
					action: rule.action,
					approval: rule.approval,
					on: rule.isOn,
				})),
			),
		};
	} finally {
		await postgres.close();
	}
}

async function agentFor(accountId: string, id: string) {
	const { secretsFor } = await import("./support.ts");
	const secrets = secretsFor(["testDatabase"]);
	const postgres = openPostgres(secrets.testDatabase);
	try {
		const rows = await postgres.db
			.select()
			.from(schema.agents)
			.where(and(eq(schema.agents.accountId, accountId), eq(schema.agents.id, id)));
		const row = rows[0];
		if (!row) {
			throw new Error("The agent is missing.");
		}
		return row;
	} finally {
		await postgres.close();
	}
}
