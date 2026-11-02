import { mkdirSync, readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { type AppDatabase, createTestMachine, type MachineRecord, openPostgres, schema } from "@tensquads/adapters";
import { and, eq } from "drizzle-orm";
import { setAgentOn } from "../packages/adapters/src/neon/commands/agents.ts";
import { compareInventory, designInventory, inventoryHtml } from "../scripts/design-inventory.mjs";
import { renderDesignMarkup } from "../scripts/render-design.mjs";
import { accessibilityViolations } from "./accessibility-helper.ts";
import {
	expectNoHorizontalScroll,
	readInventory,
	secretsFor,
	skipUnlessMacScreenshot,
	waitForScreenFonts,
} from "./support.ts";
import { expect, installLocalFonts, openWorkspace, test, type WorkspaceUser } from "./workspace.ts";

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

	const posts = countServerPosts(page);
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

	await clickWhenTheGuardClears(page, posts);
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
	const stored = await readAgent(accountId, "support");
	expect(stored.autonomy).toBe("Ask first");
	expect(stored.isOn).toBe(true);
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

function running(page: Page) {
	return page.locator("header").getByText("Running", { exact: true });
}

function paused(page: Page) {
	return page.locator("header").getByText("Paused", { exact: true });
}

function sandbox(page: Page) {
	return page.locator("section[aria-label='Sandbox']");
}

function squadSwitch(page: Page) {
	return page.getByRole("button", { name: "Squad running" });
}

function squadsNav(page: Page) {
	return page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Squads", exact: true });
}

function supportDot(page: Page, status: "Running" | "Paused") {
	return page
		.getByRole("navigation", { name: "Workspace" })
		.getByRole("button", { name: `Support ${status}`, exact: true })
		.getByRole("img", { name: status });
}

function skillRow(page: Page, id: string) {
	return page.locator("[data-loop='sel.skills'] > div").filter({ has: page.getByText(id, { exact: true }) });
}

async function reloadAgent(page: Page) {
	await page.reload();
	await page.waitForFunction(() => {
		const nodes = document.querySelectorAll("button, a, input, textarea");
		return Array.from(nodes).some((node) => Object.keys(node).some((key) => key.startsWith("__reactProps$")));
	});
	await expect(page).toHaveTitle("Agent dashboard");
	await waitForScreenFonts(page);
}

async function openAgent(page: Page, user: WorkspaceUser, agentId: string) {
	await openWorkspace(page, user);
	await page.goto(`/agents/${agentId}`);
	await expect(page).toHaveURL(new RegExp(`/agents/${agentId}$`), settled);
	await expect(page).toHaveTitle("Agent dashboard");
	await waitForScreenFonts(page);
}

function scopeFor(accountId: string) {
	return { accountId, mode: "account" as const };
}

function watchedMachine(calls: string[], failStop: boolean) {
	return (rows: readonly MachineRecord[]) => {
		const machine = createTestMachine(rows);
		return {
			...machine,
			start(agentId: string) {
				calls.push(`start:${agentId}`);
				machine.start(agentId);
			},
			stop(agentId: string) {
				calls.push(`stop:${agentId}`);
				if (failStop) {
					throw new Error("The machine did not stop.");
				}
				machine.stop(agentId);
			},
		};
	};
}

async function withDb<T>(work: (db: AppDatabase) => Promise<T>): Promise<T> {
	const postgres = openPostgres(secretsFor(["testDatabase"]).testDatabase);
	try {
		return await work(postgres.db);
	} finally {
		await postgres.close();
	}
}

interface StoredAgent {
	readonly isOn: boolean;
	readonly autonomy: string;
	readonly cpu: string;
	readonly uptime: string;
	readonly skills: readonly { readonly id: string; readonly isOn: boolean }[];
	readonly proposals: readonly { readonly id: string; readonly status: string; readonly mission: string }[];
}

async function readAgent(accountId: string, agentId: string): Promise<StoredAgent> {
	return withDb(async (db) => {
		const agentRows = await db
			.select()
			.from(schema.agents)
			.where(and(eq(schema.agents.accountId, accountId), eq(schema.agents.id, agentId)));
		const agent = agentRows[0];
		if (!agent) {
			throw new Error(`No agent ${agentId}.`);
		}
		const machineRows = await db
			.select()
			.from(schema.machines)
			.where(and(eq(schema.machines.accountId, accountId), eq(schema.machines.agentId, agentId)));
		const machine = machineRows[0];
		if (!machine) {
			throw new Error(`No machine for ${agentId}.`);
		}
		const skillRows = await db
			.select()
			.from(schema.skills)
			.where(and(eq(schema.skills.accountId, accountId), eq(schema.skills.agentId, agentId)));
		const proposalRows = await db
			.select()
			.from(schema.missionProposals)
			.where(eq(schema.missionProposals.accountId, accountId));
		return {
			isOn: agent.isOn,
			autonomy: agent.autonomy,
			cpu: machine.cpu,
			uptime: machine.uptime,
			skills: skillRows.map((row) => ({ id: row.id, isOn: row.isOn })),
			proposals: proposalRows
				.filter((row) => row.agent === agentId)
				.map((row) => ({ id: row.id, status: row.status, mission: row.mission })),
		};
	});
}

function skillFlag(stored: StoredAgent, id: string) {
	const skill = stored.skills.find((row) => row.id === id);
	if (!skill) {
		throw new Error(`No skill ${id}.`);
	}
	return skill.isOn;
}

function countServerPosts(page: Page) {
	const posts = { count: 0 };
	page.on("request", (request) => {
		if (request.method() === "POST" && request.url().includes("/_serverFn/")) {
			posts.count += 1;
		}
	});
	return posts;
}

async function clickWhenTheGuardClears(page: Page, posts: { count: number }) {
	await expect
		.poll(async () => {
			const mark = posts.count;
			await squadSwitch(page).click();
			const deadline = Date.now() + 1_000;
			while (posts.count === mark && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			return posts.count > mark;
		}, settled)
		.toBe(true);
}

async function failServerPosts(page: Page) {
	let seen = false;
	let failed = false;
	const pattern = /\/_serverFn\//;
	await page.route(pattern, async (route) => {
		const request = route.request();
		if (request.method() === "POST" && !failed) {
			failed = true;
			await route.fulfill({ status: 500, contentType: "text/plain", body: "The write failed." });
			seen = true;
			return;
		}
		await route.continue();
	});
	return {
		seen: () => seen,
		async stop() {
			await page.unroute(pattern);
		},
	};
}

function agentDetailSource() {
	const source = readFileSync(new URL("../design/Main.dc.html", import.meta.url), "utf8");
	const start = source.indexOf("<!-- ============ AGENT DETAIL ============ -->");
	const end = source.indexOf("<!-- ============ TRAFFIC ============ -->");
	if (start < 0 || end < start) {
		throw new Error("The agent detail section is missing.");
	}
	return designInventory("Main.dc.html", `<x-dc>${source.slice(start, end)}</x-dc>`);
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

async function renderedDetail(page: Page) {
	const canvas = await page.context().newPage();
	try {
		const html = await renderDesignMarkup(canvas, readInventory("Main"), {
			view: "agents",
			agentId: "support",
			dockOpen: false,
		});
		await canvas.setContent(html);
		await canvas.locator("[data-handler='goAdmin']").evaluate((element) => element.remove());
		return await sectionInventory(canvas, "[data-if='isAgentDetail']");
	} finally {
		await canvas.close();
	}
}

async function openDesignDetail(page: Page, width: number, height: number) {
	const canvas = await page.context().newPage();
	await installLocalFonts(canvas);
	await canvas.setViewportSize({ width, height });
	const body = await renderDesignMarkup(canvas, readInventory("Main"), {
		view: "agents",
		agentId: "support",
		dockOpen: false,
	});
	const source = readFileSync(new URL("../design/Main.dc.html", import.meta.url), "utf8");
	const css = source.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
	await canvas.setContent(
		`<!doctype html><html lang="en"><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"><style>${css}x-dc{display:contents}</style></head><body>${body}</body></html>`,
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

interface Box {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly right: number;
	readonly bottom: number;
}

interface DetailBoxes {
	readonly column: Box | null;
	readonly childGaps: readonly number[];
	readonly kpiBoxes: readonly Box[];
	readonly kpiGaps: readonly number[];
	readonly skills: Box | null;
	readonly sandbox: Box | null;
	readonly squadSwitch: Box | null;
	readonly skillSwitch: Box | null;
}

function expectNear(actual: number, expected: number, label: string) {
	expect(Math.abs(actual - expected), `${label}: build ${actual}, design ${expected}`).toBeLessThanOrEqual(0.5);
}

function expectDetail(built: DetailBoxes, design: DetailBoxes, name: string) {
	expect(design.column, `${name} design column`).not.toBeNull();
	expect(built.column, `${name} build column`).not.toBeNull();
	expect(design.column?.width ?? 0).toBeGreaterThan(0);
	expectNear(built.column?.width ?? 0, design.column?.width ?? 0, `${name} column width`);
	expectNear(built.column?.x ?? 0, design.column?.x ?? 0, `${name} column x`);
	expect(design.childGaps.length).toBeGreaterThan(0);
	expect(built.childGaps.length).toBe(design.childGaps.length);
	for (const [index, gap] of built.childGaps.entries()) {
		expect(design.childGaps[index] ?? 0).toBeGreaterThan(0);
		expectNear(gap, design.childGaps[index] ?? 0, `${name} column gap ${index}`);
	}
	expect(design.kpiBoxes.length).toBeGreaterThan(1);
	expect(built.kpiBoxes.length).toBe(design.kpiBoxes.length);
	for (const [index, box] of built.kpiBoxes.entries()) {
		const target = design.kpiBoxes[index];
		expect(target?.width ?? 0).toBeGreaterThan(0);
		expectNear(box.x, target?.x ?? 0, `${name} kpi ${index} x`);
		expectNear(box.y, target?.y ?? 0, `${name} kpi ${index} y`);
		expectNear(box.width, target?.width ?? 0, `${name} kpi ${index} width`);
	}
	expect(built.kpiGaps.length).toBe(design.kpiGaps.length);
	expect(design.kpiGaps[0] ?? 0).toBeGreaterThan(0);
	for (const [index, gap] of built.kpiGaps.entries()) {
		expectNear(gap, design.kpiGaps[index] ?? 0, `${name} kpi gap ${index}`);
	}
	expectBox(built.skills, design.skills, `${name} skills`);
	expectBox(built.sandbox, design.sandbox, `${name} sandbox`);
	const designGap = pairGap(design.skills, design.sandbox);
	expect(designGap).toBeGreaterThan(0);
	expectNear(pairGap(built.skills, built.sandbox), designGap, `${name} skills sandbox gap`);
	if (name === "1440") {
		expect(design.sandbox?.x ?? 0).toBeGreaterThan(design.skills?.right ?? 0);
	}
	if (name === "390") {
		expect(design.sandbox?.y ?? 0).toBeGreaterThan(design.skills?.bottom ?? 0);
	}
	expect(design.skillSwitch?.width ?? 0).toBeGreaterThan(0);
	expect(design.squadSwitch?.width ?? 0).toBeGreaterThan(design.skillSwitch?.width ?? 0);
	expect(design.squadSwitch?.height ?? 0).toBeGreaterThan(0);
	expectNear(built.squadSwitch?.width ?? 0, design.squadSwitch?.width ?? 0, `${name} squad switch width`);
	expectNear(built.squadSwitch?.height ?? 0, design.squadSwitch?.height ?? 0, `${name} squad switch height`);
	expectNear(built.skillSwitch?.width ?? 0, design.skillSwitch?.width ?? 0, `${name} skill switch width`);
	expectNear(built.skillSwitch?.height ?? 0, design.skillSwitch?.height ?? 0, `${name} skill switch height`);
}

function expectBox(built: Box | null, design: Box | null, label: string) {
	expect(design, `${label} design`).not.toBeNull();
	expect(built, `${label} build`).not.toBeNull();
	expect(design?.width ?? 0).toBeGreaterThan(0);
	expectNear(built?.x ?? 0, design?.x ?? 0, `${label} x`);
	expectNear(built?.y ?? 0, design?.y ?? 0, `${label} y`);
	expectNear(built?.width ?? 0, design?.width ?? 0, `${label} width`);
	expectNear(built?.height ?? 0, design?.height ?? 0, `${label} height`);
}

function pairGap(skills: Box | null, sandbox: Box | null) {
	const left = skills ?? { x: 0, y: 0, width: 0, height: 0, right: 0, bottom: 0 };
	const right = sandbox ?? { x: 0, y: 0, width: 0, height: 0, right: 0, bottom: 0 };
	if (right.x >= left.right - 1) {
		return right.x - left.right;
	}
	return right.y - left.bottom;
}

async function measureDetail(page: Page): Promise<DetailBoxes> {
	return page.evaluate(() => {
		const boxOf = (element: Element) => {
			const box = element.getBoundingClientRect();
			return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
		};
		const findBox = (selector: string) => {
			const element = document.querySelector(selector);
			return element ? boxOf(element) : null;
		};
		const column = document.querySelector("[data-if='isAgentDetail'] > div");
		const kids = column ? [...column.children] : [];
		const childGaps = kids.slice(1).map((node, index) => boxOf(node).y - boxOf(kids[index] ?? node).bottom);
		const cells = [...document.querySelectorAll("section[aria-label='Squad numbers'] [data-loop='sel.kpis'] > div")];
		const kpiGaps = cells.slice(1).map((cell, index) => {
			const previous = boxOf(cells[index] ?? cell);
			const next = boxOf(cell);
			const sameRow = Math.abs(next.y - previous.y) < 1;
			return sameRow ? next.x - previous.right : next.y - previous.bottom;
		});
		return {
			column: column ? boxOf(column) : null,
			childGaps,
			kpiBoxes: cells.map((cell) => boxOf(cell)),
			kpiGaps,
			skills: findBox("section[aria-label='Skills']"),
			sandbox: findBox("section[aria-label='Sandbox']"),
			squadSwitch: findBox("button[aria-label='Squad running']"),
			skillSwitch: findBox("button[aria-label='Skill enabled']"),
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
		await board.setViewportSize({
			width: left.width + right.width,
			height: Math.max(left.height, right.height),
		});
		await board.setContent(
			'<!doctype html><html><body style="margin:0;display:flex;background:#fff"><img alt="Design" src="https://evidence.local/design.png"><img alt="Build" src="https://evidence.local/build.png"></body></html>',
		);
		await board.locator("img").nth(1).waitFor();
		await board.screenshot({ path: file, fullPage: true, animations: "disabled", caret: "hide", scale: "css" });
	} finally {
		await board.close();
	}
}
