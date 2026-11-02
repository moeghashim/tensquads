import { readFileSync } from "node:fs";
import type { Page, Route } from "@playwright/test";
import { type AppDatabase, createTestMachine, type MachineRecord, openPostgres, schema } from "@tensquads/adapters";
import { and, eq } from "drizzle-orm";
import { compareInventory, designInventory, inventoryHtml } from "../scripts/design-inventory.mjs";
import { renderDesignMarkup } from "../scripts/render-design.mjs";
import { readInventory, secretsFor, waitForScreenFonts } from "./support.ts";
import { expect, installLocalFonts, openWorkspace, type WorkspaceUser } from "./workspace.ts";

export function scopeFor(accountId: string) {
	return { accountId, mode: "account" as const };
}

export function watchedMachine(calls: string[], failStop: boolean) {
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

export async function withDb<T>(work: (db: AppDatabase) => Promise<T>): Promise<T> {
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

export async function readAgent(accountId: string, agentId: string): Promise<StoredAgent> {
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

export function skillFlag(stored: StoredAgent, id: string) {
	const skill = stored.skills.find((row) => row.id === id);
	if (!skill) {
		throw new Error(`No skill ${id}.`);
	}
	return skill.isOn;
}

export function agentDetailSource() {
	const source = readFileSync(new URL("../design/Main.dc.html", import.meta.url), "utf8");
	const start = source.indexOf("<!-- ============ AGENT DETAIL ============ -->");
	const end = source.indexOf("<!-- ============ TRAFFIC ============ -->");
	if (start < 0 || end < start) {
		throw new Error("The agent detail section is missing.");
	}
	return designInventory("Main.dc.html", `<x-dc>${source.slice(start, end)}</x-dc>`);
}

export function expectMatch(
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

export async function sectionInventory(page: Page, selector: string) {
	const html = await page.locator(selector).evaluate((element) => element.outerHTML);
	return inventoryHtml(html);
}

export async function renderedDetail(page: Page) {
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

export async function openDesignDetail(page: Page, width: number, height: number) {
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
	const font = source.match(/https:\/\/fonts\.googleapis\.com\/css2\?[^"']+/)?.[0]?.replaceAll("&amp;", "&");
	if (!font) {
		throw new Error("The design font link is missing.");
	}
	await canvas.setContent(
		`<!doctype html><html lang="en"><head><link rel="stylesheet" href="${font}"><style>${css}x-dc{display:contents}</style></head><body>${body}</body></html>`,
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

export function loadedInterWeights(page: Page): Promise<string[]> {
	return page.evaluate(() =>
		[
			...new Set(
				[...document.fonts]
					.filter((face) => face.family === "Inter" && face.status === "loaded")
					.map((face) => face.weight),
			),
		].sort(),
	);
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

export function expectDetail(built: DetailBoxes, design: DetailBoxes, name: string) {
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

export async function measureDetail(page: Page): Promise<DetailBoxes> {
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

export async function shot(page: Page) {
	return page.screenshot({ fullPage: true, animations: "disabled", caret: "hide", scale: "css" });
}

function pngSize(image: Buffer) {
	return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
}

export async function stitch(page: Page, design: Buffer, build: Buffer, file: string) {
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

export async function holdServerPosts(page: Page, count = 1, stallReads = false) {
	const posts: string[] = [];
	let reads = 0;
	let release: (send: boolean) => void = () => undefined;
	const held = new Promise<boolean>((resolve) => {
		release = resolve;
	});
	const pattern = /\/_serverFn\//;
	const handler = async (route: Route) => {
		if (route.request().method() !== "POST") {
			if (stallReads && posts.length > 0) {
				reads += 1;
				await held;
				await route.abort().catch(() => undefined);
				return;
			}
			return route.continue();
		}
		posts.push(route.request().postData() ?? "");
		if (posts.length <= count && !(await held)) {
			await route.abort().catch(() => undefined);
			return;
		}
		await route.continue().catch(() => undefined);
	};
	await page.route(pattern, handler);
	return {
		posts,
		reads: () => reads,
		release: () => release(true),
		async stop() {
			release(false);
			await page.unroute(pattern, handler);
		},
	};
}

export function running(page: Page) {
	return page.locator("header").getByText("Running", { exact: true });
}

export function paused(page: Page) {
	return page.locator("header").getByText("Paused", { exact: true });
}

export function sandbox(page: Page) {
	return page.locator("section[aria-label='Sandbox']");
}

export function squadSwitch(page: Page) {
	return page.getByRole("button", { name: "Squad running" });
}

export function squadsNav(page: Page) {
	return page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Squads", exact: true });
}

export function supportDot(page: Page, status: "Running" | "Paused") {
	return page
		.getByRole("navigation", { name: "Workspace" })
		.getByRole("button", { name: `Support ${status}`, exact: true })
		.getByRole("img", { name: status });
}

export function skillRow(page: Page, id: string) {
	return page.locator("[data-loop='sel.skills'] > div").filter({ has: page.getByText(id, { exact: true }) });
}

export async function reloadAgent(page: Page) {
	await page.reload();
	await page.waitForFunction(() => {
		const nodes = document.querySelectorAll("button, a, input, textarea");
		return Array.from(nodes).some((node) => Object.keys(node).some((key) => key.startsWith("__reactProps$")));
	});
	await expect(page).toHaveTitle("Agent dashboard");
	await waitForScreenFonts(page);
}

export async function openAgent(page: Page, user: WorkspaceUser, agentId: string) {
	await openWorkspace(page, user);
	await page.goto(`/agents/${agentId}`);
	await expect(page).toHaveURL(new RegExp(`/agents/${agentId}$`), { timeout: 15_000 });
	await expect(page).toHaveTitle("Agent dashboard");
	await waitForScreenFonts(page);
}

export async function holdAgentReads(page: Page) {
	let held = false;
	let releaseGate: () => void = () => undefined;
	const gate = new Promise<void>((resolve) => {
		releaseGate = resolve;
	});
	const pattern = /\/_serverFn\//;
	const handler = async (route: Route) => {
		const request = route.request();
		if (request.method() === "GET" && decodeURIComponent(request.url()).includes('"support"')) {
			const response = await route.fetch();
			held = true;
			await gate;
			await route.fulfill({ response }).catch(() => undefined);
			return;
		}
		await route.continue();
	};
	await page.route(pattern, handler);
	return {
		held: () => held,
		release: () => releaseGate(),
		async stop() {
			releaseGate();
			await page.unroute(pattern, handler);
		},
	};
}

export async function failServerPosts(page: Page) {
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
