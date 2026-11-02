import { mkdirSync } from "node:fs";
import { PENDING_TASK_WINDOW_MS } from "../packages/adapters/src/pending-window.ts";
import { setAgentOn } from "../packages/adapters/src/neon/commands/agents.ts";
import {
	agentDetailSource,
	expectDetail,
	expectMatch,
	failServerPosts,
	holdServerPosts,
	measureDetail,
	openAgent,
	openDesignDetail,
	paused,
	readAgent,
	reloadAgent,
	renderedDetail,
	running,
	sandbox,
	scopeFor,
	sectionInventory,
	shot,
	skillFlag,
	skillRow,
	squadSwitch,
	squadsNav,
	stitch,
	supportDot,
	watchedMachine,
	withDb,
} from "./agent-detail-support.ts";
import { accessibilityViolations } from "./accessibility-helper.ts";
import { expectNoHorizontalScroll, skipUnlessMacScreenshot, waitForScreenFonts } from "./support.ts";
import { expect, openWorkspace, test } from "./workspace.ts";

const boards = [
	{ name: "1440", width: 1440, height: 1300 },
	{ name: "390", width: 390, height: 1300 },
] as const;

const pendingMission = "No mission yet. Master has proposed one; approve it in the inbox on the Overview.";
const supportMission = "Answer every customer within an hour and keep satisfaction above 4.5.";
const noTargets = "No targets until the mission is approved.";
const settled = { timeout: 15_000 };

test("the dashboard shows every section for one agent", async ({ page, workspaceUser }) => {
	test.setTimeout(60_000);
	await openAgent(page, workspaceUser, "support");
	await expect(page.getByRole("heading", { level: 1, name: "Support squad" })).toBeVisible();
	await expect(page.getByRole("button", { name: "All squads", exact: true })).toBeVisible();
	for (const name of ["Mission", "Squad numbers", "Skills", "Sandbox", "Messages"]) {
		await expect(page.getByRole("region", { name })).toBeVisible();
	}
	await expect(page.getByText(supportMission)).toBeVisible();
	await expect(page.getByText("Approved by you")).toBeVisible();
	await expect(page.getByText("goal 60 min")).toBeVisible();
	await expect(page.getByText("81% done")).toBeVisible();
	await expect(page.getByText("inbox.read", { exact: true })).toBeVisible();
	await expect(page.getByText("vps-support-01")).toBeVisible();
	await expect(page.getByText("22%", { exact: true })).toBeVisible();
	await expect(page.getByText("18 days", { exact: true })).toBeVisible();
	await expect(page.getByText("Isolated · running")).toBeVisible();
	await expect(page.getByText("Starting")).toHaveCount(0);
	const messages = page.locator("section[aria-label='Messages']").locator("[data-loop='sel.bus'] > button");
	await expect(messages).toHaveCount(3);
	await expect(messages.nth(0)).toContainText("10:55");
	await expect(messages.nth(0)).toContainText("Escalation");
	await expect(messages.nth(0)).toContainText("Support → Master");
	await expect(messages.nth(1)).toContainText("10:44");
	await expect(messages.nth(1)).toContainText("Relay");
	await expect(messages.nth(2)).toContainText("10:43");
	await expect(messages.nth(2)).toContainText("Request");
	await messages.nth(0).click();
	await expect(page).toHaveURL(/\/traffic$/, settled);
	await expect(page).toHaveTitle("Agent traffic");
});

test("the switch turns an agent off and shows 0 percent and Paused", async ({ page, workspaceUser, accountId }) => {
	test.setTimeout(120_000);
	await openAgent(page, workspaceUser, "support");
	await expect(running(page)).toBeVisible();
	await expect(sandbox(page).getByText("22%", { exact: true })).toBeVisible();
	await expect(sandbox(page).getByText("18 days", { exact: true })).toBeVisible();

	const stopped = await withDb(async (db) => {
		const calls: string[] = [];
		await expect(setAgentOn(db, scopeFor(accountId), "support", false, watchedMachine(calls, true))).rejects.toThrow(
			/The machine did not stop/,
		);
		return calls;
	});
	expect(stopped).toEqual(["stop:support"]);
	expect((await readAgent(accountId, "support")).isOn).toBe(true);
	await reloadAgent(page);
	await expect(running(page)).toBeVisible();
	await expect(sandbox(page).getByText("22%", { exact: true })).toBeVisible();

	const gate = await failServerPosts(page);
	try {
		await squadSwitch(page).click();
		await expect.poll(() => gate.seen(), settled).toBe(true);
		await expect(running(page)).toBeVisible();
		await expect(paused(page)).toHaveCount(0);
		expect((await readAgent(accountId, "support")).isOn).toBe(true);
	} finally {
		await gate.stop();
	}

	await expect(squadSwitch(page)).toHaveAttribute("aria-pressed", "true", settled);
	await squadSwitch(page).click();
	await expect(paused(page)).toBeVisible(settled);
	await expect(running(page)).toHaveCount(0);
	await expect(sandbox(page).getByText("0%", { exact: true })).toBeVisible();
	await expect(sandbox(page).getByText("Paused", { exact: true })).toBeVisible();
	await expect(sandbox(page).getByText("22%", { exact: true })).toHaveCount(0);
	await expect(sandbox(page).getByText("18 days", { exact: true })).toHaveCount(0);
	await expect(supportDot(page, "Paused")).toBeVisible();
	const off = await readAgent(accountId, "support");
	expect(off.isOn).toBe(false);
	expect(off.cpu).toBe("22%");
	expect(off.uptime).toBe("18 days");

	await reloadAgent(page);
	await expect(paused(page)).toBeVisible();
	await expect(sandbox(page).getByText("0%", { exact: true })).toBeVisible();
	await expect(sandbox(page).getByText("Paused", { exact: true })).toBeVisible();
	await expect(supportDot(page, "Paused")).toBeVisible();

	const started = await withDb(async (db) => {
		const calls: string[] = [];
		await setAgentOn(db, scopeFor(accountId), "support", true, watchedMachine(calls, false));
		return calls;
	});
	expect(started).toEqual(["start:support"]);
	expect((await readAgent(accountId, "support")).isOn).toBe(true);
	await reloadAgent(page);
	await expect(running(page)).toBeVisible();
	await expect(sandbox(page).getByText("22%", { exact: true })).toBeVisible();
	await expect(sandbox(page).getByText("18 days", { exact: true })).toBeVisible();
	await expect(supportDot(page, "Running")).toBeVisible();
});

test("a skill switch changes only that skill", async ({ page, workspaceUser, accountId }) => {
	test.setTimeout(60_000);
	await openAgent(page, workspaceUser, "support");
	const row = skillRow(page, "inbox.read");
	await expect(row.getByRole("button", { name: "Skill enabled" })).toHaveAttribute("aria-pressed", "true");
	await row.getByRole("button", { name: "Skill enabled" }).click();
	await expect(row.getByRole("button", { name: "Skill enabled" })).toHaveAttribute("aria-pressed", "false", settled);
	for (const id of ["inbox.draft_reply", "shopify.refund", "orders.lookup"]) {
		await expect(skillRow(page, id).getByRole("button", { name: "Skill enabled" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	}
	await expect(running(page)).toBeVisible();
	await expect
		.poll(async () => skillFlag(await readAgent(accountId, "support"), "inbox.read"), settled)
		.toBe(false);
	const stored = await readAgent(accountId, "support");
	expect(stored.isOn).toBe(true);
	expect(skillFlag(stored, "inbox.read")).toBe(false);
	expect(skillFlag(stored, "inbox.draft_reply")).toBe(true);
	expect(skillFlag(stored, "shopify.refund")).toBe(true);
	expect(skillFlag(stored, "orders.lookup")).toBe(true);
});

test("the autonomy picker changes autonomy and not on or off", async ({ page, workspaceUser, accountId }) => {
	test.setTimeout(60_000);
	await openAgent(page, workspaceUser, "support");
	const group = page.getByRole("group", { name: "Autonomy" });
	await expect(group.getByRole("button", { name: "Auto under limit", exact: true })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await group.getByRole("button", { name: "Ask first", exact: true }).click();
	await expect(group.getByRole("button", { name: "Ask first", exact: true })).toHaveAttribute(
		"aria-pressed",
		"true",
		settled,
	);
	await expect(group.getByRole("button", { name: "Auto under limit", exact: true })).toHaveAttribute(
		"aria-pressed",
		"false",
	);
	await expect(running(page)).toBeVisible();
	await expect.poll(async () => (await readAgent(accountId, "support")).autonomy, settled).toBe("Ask first");
	const stored = await readAgent(accountId, "support");
	expect(stored.autonomy).toBe("Ask first");
	expect(stored.isOn).toBe(true);
});

test("pending skill writes show at once and reach the server in click order", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	test.setTimeout(90_000);
	await openAgent(page, workspaceUser, "support");
	const held = await holdServerPosts(page);
	try {
		for (const id of ["inbox.read", "inbox.draft_reply"]) {
			const control = skillRow(page, id).getByRole("button");
			await control.click();
			await expect(control).toHaveAttribute("aria-pressed", "false");
			await expect(control).toHaveCSS("justify-content", "flex-start");
		}
		await expect.poll(() => held.posts.length).toBe(1);
		expect(skillFlag(await readAgent(accountId, "support"), "inbox.read")).toBe(true);
		held.release();
		await expect.poll(() => held.posts.length, settled).toBe(2);
		expect(held.posts[0]).toContain("inbox.read");
		expect(held.posts[1]).toContain("inbox.draft_reply");
		await expect
			.poll(async () => {
				const stored = await readAgent(accountId, "support");
				return [skillFlag(stored, "inbox.read"), skillFlag(stored, "inbox.draft_reply")];
			}, settled)
			.toEqual([false, false]);
	} finally {
		await held.stop();
	}
});

test("a timed out skill write restores the server value and keeps the queue moving", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	test.setTimeout(90_000);
	await openAgent(page, workspaceUser, "support");
	const held = await holdServerPosts(page, 1, true);
	try {
		const control = skillRow(page, "inbox.read").getByRole("button");
		await control.click();
		await expect(control).toHaveAttribute("aria-pressed", "false");
		const next = skillRow(page, "inbox.draft_reply").getByRole("button");
		await next.click();
		await expect(next).toHaveAttribute("aria-pressed", "false");
		await expect(control).toHaveAttribute("aria-pressed", "true", { timeout: PENDING_TASK_WINDOW_MS + 15_000 });
		await expect(next).toHaveAttribute("aria-pressed", "false");
		await expect.poll(() => held.reads(), settled).toBeGreaterThan(0);
		await expect.poll(() => held.posts.length, settled).toBe(2);
		await expect(page).toHaveURL(/\/agents\/support$/);
		await expect
			.poll(async () => skillFlag(await readAgent(accountId, "support"), "inbox.draft_reply"), settled)
			.toBe(false);
	} finally {
		await held.stop();
	}
});

test("pending agent writes survive leaving and returning to the dashboard", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	test.setTimeout(90_000);
	await openAgent(page, workspaceUser, "support");
	const held = await holdServerPosts(page);
	try {
		const skill = skillRow(page, "inbox.read").getByRole("button");
		const autonomy = page.getByRole("group", { name: "Autonomy" });
		await skill.click();
		await expect.poll(() => held.posts.length).toBe(1);
		await autonomy.getByRole("button", { name: "Ask first", exact: true }).click();
		await expect(skill).toHaveAttribute("aria-pressed", "false");
		await expect(autonomy.getByRole("button", { name: "Ask first", exact: true })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(running(page)).toBeVisible();
		await page.getByRole("button", { name: "All squads", exact: true }).click();
		await expect(page).toHaveURL(/\/agents$/);
		await page
			.getByRole("navigation", { name: "Workspace" })
			.getByRole("button", { name: "Support Running", exact: true })
			.click();
		await expect(page).toHaveURL(/\/agents\/support$/);
		await expect(skill).toHaveAttribute("aria-pressed", "false");
		await expect(autonomy.getByRole("button", { name: "Ask first", exact: true })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		const latest = autonomy.getByRole("button", { name: "Full auto", exact: true });
		await latest.click();
		await expect(latest).toHaveAttribute("aria-pressed", "true");
		await expect(running(page)).toBeVisible();
		expect(held.posts).toHaveLength(1);
		held.release();
		await expect
			.poll(async () => {
				const stored = await readAgent(accountId, "support");
				return [stored.autonomy, skillFlag(stored, "inbox.read")];
			}, settled)
			.toEqual(["Full auto", false]);
		expect(held.posts).toHaveLength(2);
		expect(held.posts[0]).toContain("inbox.read");
		expect(held.posts[1]).toContain("Full auto");
		expect(held.posts[1]).not.toContain("Ask first");
		await expect(latest).toHaveAttribute("aria-pressed", "true");
	} finally {
		await held.stop();
	}
});

test("revise opens overview while its write and a skill write are held", async ({ page, workspaceUser, accountId }) => {
	test.setTimeout(60_000);
	await openAgent(page, workspaceUser, "support");
	const held = await holdServerPosts(page, 2);
	try {
		await skillRow(page, "inbox.read").getByRole("button").click();
		await expect.poll(() => held.posts.length).toBe(1);
		await page.getByRole("button", { name: "Ask Master to revise" }).click();
		await expect(page).toHaveURL(/\/overview$/);
		await expect.poll(() => held.posts.length).toBe(2);
		expect((await readAgent(accountId, "support")).proposals).toEqual([]);
		held.release();
		await expect.poll(async () => (await readAgent(accountId, "support")).proposals.length, settled).toBe(1);
	} finally {
		await held.stop();
	}
});

test("queued switches and autonomy coalesce to their latest values", async ({ page, workspaceUser, accountId }) => {
	test.setTimeout(90_000);
	await openAgent(page, workspaceUser, "support");
	const held = await holdServerPosts(page);
	try {
		const skill = skillRow(page, "inbox.read").getByRole("button");
		await skill.click();
		await expect.poll(() => held.posts.length).toBe(1);
		for (const on of [true, false, true]) {
			await skill.click();
			await expect(skill).toHaveAttribute("aria-pressed", String(on));
		}
		for (const on of [false, true, false]) {
			await squadSwitch(page).click();
			await expect(squadSwitch(page)).toHaveAttribute("aria-pressed", String(on));
			await expect(squadSwitch(page)).toHaveCSS("justify-content", on ? "flex-end" : "flex-start");
		}
		const group = page.getByRole("group", { name: "Autonomy" });
		for (const label of ["Ask first", "Full auto", "Ask first"]) {
			const option = group.getByRole("button", { name: label, exact: true });
			await option.click();
			await expect(option).toHaveAttribute("aria-pressed", "true");
			await expect(option).toHaveCSS("background-color", "rgb(255, 255, 255)");
		}
		await expect(running(page)).toBeVisible();
		await expect(sandbox(page).getByText("22%", { exact: true })).toBeVisible();
		await expect(sandbox(page).getByText("18 days", { exact: true })).toBeVisible();
		held.release();
		await expect
			.poll(async () => {
				const stored = await readAgent(accountId, "support");
				return [stored.isOn, stored.autonomy, skillFlag(stored, "inbox.read")];
			}, settled)
			.toEqual([false, "Ask first", true]);
		expect(held.posts).toHaveLength(4);
		await expect(paused(page)).toBeVisible(settled);
		await reloadAgent(page);
		await expect(skill).toHaveAttribute("aria-pressed", "true");
	} finally {
		await held.stop();
	}
});

test("turning on a stopped agent shows Just started", async ({ page, workspaceUser, accountId }) => {
	test.setTimeout(60_000);
	await openAgent(page, workspaceUser, "inventory");
	await expect(paused(page)).toBeVisible();
	await expect(sandbox(page).getByText("Paused", { exact: true })).toBeVisible();
	await squadSwitch(page).click();
	await expect(running(page)).toBeVisible(settled);
	await expect(sandbox(page).getByText("Just started", { exact: true })).toBeVisible();
	await expect(sandbox(page).getByText("0%", { exact: true })).toBeVisible();
	await expect(page.getByText("Starting")).toHaveCount(0);
	const stored = await readAgent(accountId, "inventory");
	expect(stored.isOn).toBe(true);
	expect(stored.uptime).toBe("Paused");
	expect(stored.cpu).toBe("0%");
});

test("an agent with no mission shows the pending text and no targets", async ({ page, workspaceUser }) => {
	test.setTimeout(60_000);
	await openAgent(page, workspaceUser, "inventory");
	await expect(page.getByText(pendingMission)).toBeVisible();
	await expect(page.getByText("Pending approval")).toBeVisible();
	await expect(page.getByText(noTargets)).toBeVisible();
	await expect(page.locator("[data-loop='sel.targets'] > div")).toHaveCount(0);
	await page.goto("/agents/support");
	await expect(page).toHaveTitle("Agent dashboard");
	await expect(page.getByText(supportMission)).toBeVisible();
	await expect(page.getByText("goal 60 min")).toBeVisible();
	await expect(page.getByText("goal 4.5 / 5")).toBeVisible();
	await expect(page.getByText("goal under 10")).toBeVisible();
	await expect(page.locator("[data-loop='sel.targets'] > div")).toHaveCount(3);
	await expect(page.getByText(pendingMission)).toHaveCount(0);
	await expect(page.getByText(noTargets)).toHaveCount(0);
});

test("ask to revise adds one proposal and opens overview, and a repeat adds none", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	test.setTimeout(90_000);
	await openAgent(page, workspaceUser, "support");
	expect(await readAgent(accountId, "support")).toMatchObject({ proposals: [] });
	await page.getByRole("button", { name: "Ask Master to revise" }).click();
	await expect(page).toHaveURL(/\/overview$/, settled);
	await expect(page).toHaveTitle("tensquads workspace");
	await expect.poll(async () => (await readAgent(accountId, "support")).proposals.length, settled).toBe(1);
	const created = (await readAgent(accountId, "support")).proposals;
	expect(created).toHaveLength(1);
	expect(created[0]?.status).toBe("Revising");
	expect(created[0]?.mission).toBe(supportMission);
	expect(created[0]?.id).toMatch(/^mp-support-\d+$/);
	await page.goto("/agents/support");
	await expect(page).toHaveTitle("Agent dashboard");
	await page.getByRole("button", { name: "Ask Master to revise" }).click();
	await expect(page).toHaveURL(/\/overview$/, settled);
	const repeat = (await readAgent(accountId, "support")).proposals;
	expect(repeat).toEqual(created);

	await page.goto("/agents/inventory");
	await expect(page).toHaveTitle("Agent dashboard");
	const before = (await readAgent(accountId, "inventory")).proposals;
	expect(before.map((proposal) => ({ id: proposal.id, status: proposal.status }))).toEqual([
		{ id: "mp-inventory", status: "Proposed" },
	]);
	await page.getByRole("button", { name: "Ask Master to revise" }).click();
	await expect(page).toHaveURL(/\/overview$/, settled);
	const after = (await readAgent(accountId, "inventory")).proposals;
	expect(after.map((proposal) => ({ id: proposal.id, status: proposal.status }))).toEqual([
		{ id: "mp-inventory", status: "Proposed" },
	]);
});

test("all squads opens the list and the nav stays on Squads", async ({ page, workspaceUser }) => {
	await openAgent(page, workspaceUser, "support");
	await page.getByRole("button", { name: "All squads", exact: true }).click();
	await expect(page).toHaveURL(/\/agents$/, settled);
	await expect(page).toHaveTitle("Agents");
	await expect(squadsNav(page)).toHaveCSS("font-weight", "600");
});

test("an unknown agent opens the squad list", async ({ page, workspaceUser }) => {
	await openWorkspace(page, workspaceUser);
	await page.goto("/agents/not-a-real-squad");
	await expect(page).toHaveURL(/\/agents$/, settled);
	await expect(page).toHaveTitle("Agents");
});

test("the agent detail inventory matches the rendered design", async ({ page, workspaceUser }) => {
	test.setTimeout(60_000);
	const source = agentDetailSource();
	const sourceNames = source.handlers.map((handler: { handler: string }) => handler.handler);
	expect(sourceNames).toEqual(["goAgents", "sel.toggle", "sel.askRevise", "sk.toggle", "o.pick", "e.inspect"]);
	expect(source.loops).toContainEqual({ kind: "if", value: "isAgentDetail" });
	expect(source.loops).toContainEqual({ kind: "if", value: "sel.noTargets" });
	expect(source.loops).toContainEqual({ kind: "for", list: "sel.targets", as: "t" });
	expect(source.loops).toContainEqual({ kind: "for", list: "sel.kpis", as: "k" });
	expect(source.loops).toContainEqual({ kind: "for", list: "sel.skills", as: "sk" });
	expect(source.loops).toContainEqual({ kind: "for", list: "sel.autonomyOpts", as: "o" });
	expect(source.loops).toContainEqual({ kind: "for", list: "sel.egress", as: "h" });
	expect(source.loops).toContainEqual({ kind: "for", list: "sel.secrets", as: "s" });
	expect(source.loops).toContainEqual({ kind: "for", list: "sel.bus", as: "e" });

	await openAgent(page, workspaceUser, "support");
	const design = await renderedDetail(page);
	const built = await sectionInventory(page, "[data-if='isAgentDetail']");
	expectMatch(design, built);
	expect(built.loops.some((loop: { kind: string; value?: string }) => loop.value === "sel.noTargets")).toBe(false);
	expect(design.loops.some((loop: { kind: string; value?: string }) => loop.value === "sel.noTargets")).toBe(false);
});

test("the agent detail boxes match the rendered design at 1440 and 390", async ({ page, workspaceUser }) => {
	test.setTimeout(90_000);
	await openAgent(page, workspaceUser, "support");
	for (const board of boards) {
		await page.setViewportSize({ width: board.width, height: board.height });
		await waitForScreenFonts(page);
		const designPage = await openDesignDetail(page, board.width, board.height);
		try {
			const design = await measureDetail(designPage);
			const built = await measureDetail(page);
			expectDetail(built, design, board.name);
		} finally {
			await designPage.close();
		}
	}
});

test("the agent detail matches the macOS screenshot baselines", async ({ page, workspaceUser }) => {
	test.setTimeout(90_000);
	skipUnlessMacScreenshot();
	await openAgent(page, workspaceUser, "support");
	for (const board of boards) {
		await page.setViewportSize({ width: board.width, height: board.height });
		await waitForScreenFonts(page);
		await expect(page).toHaveScreenshot(`agent-detail-${board.name}.png`, { fullPage: true });
	}
});

test("the side-by-side evidence shows the design and the build", async ({ page, workspaceUser }) => {
	test.setTimeout(90_000);
	test.skip(
		process.env.AGENT_DETAIL_EVIDENCE !== "1" || process.platform !== "darwin",
		"Side-by-side evidence is captured once on macOS.",
	);
	const dir = ".no-mistakes/evidence/02-agent-detail";
	mkdirSync(dir, { recursive: true });
	await openAgent(page, workspaceUser, "support");
	for (const board of boards) {
		await page.setViewportSize({ width: board.width, height: board.height });
		await waitForScreenFonts(page);
		const build = await shot(page);
		const designPage = await openDesignDetail(page, board.width, board.height);
		try {
			const design = await shot(designPage);
			await stitch(page, design, build, `${dir}/side-by-side-${board.name}.png`);
		} finally {
			await designPage.close();
		}
	}
});

test("the agent detail focus ring is 2 px blue with a 2 px offset", async ({ page, workspaceUser }) => {
	await openAgent(page, workspaceUser, "support");
	await page.getByRole("button", { name: "All squads", exact: true }).focus();
	await page.keyboard.press("Tab");
	const ring = await page.evaluate(() => {
		const element = document.activeElement;
		if (!(element instanceof HTMLElement)) return { label: "", width: "", offset: "", color: "" };
		const style = getComputedStyle(element);
		return {
			label: element.getAttribute("aria-label") ?? "",
			width: style.outlineWidth,
			offset: style.outlineOffset,
			color: style.outlineColor,
		};
	});
	expect(ring).toEqual({ label: "Squad running", width: "2px", offset: "2px", color: "rgb(1, 105, 204)" });
});

test("the agent detail page passes axe and does not scroll sideways", async ({ page, workspaceUser }) => {
	test.setTimeout(90_000);
	await openAgent(page, workspaceUser, "support");
	for (const board of boards) {
		await page.setViewportSize({ width: board.width, height: board.height });
		await waitForScreenFonts(page);
		expect(await accessibilityViolations(page)).toEqual([]);
		await expectNoHorizontalScroll(page);
	}
});
