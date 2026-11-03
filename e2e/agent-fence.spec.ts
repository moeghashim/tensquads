import type { Page, Route } from "@playwright/test";
import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";

import {
	openAgent,
	paused,
	readAgent,
	reloadAgent,
	running,
	serverFnExport,
	skillFlag,
	skillRow,
	squadSwitch,
} from "./agent-detail-support.ts";
import { expect, test } from "./workspace.ts";

const fenceStorageKey = "tensquads.writeFence";
const fenceModule = "/src/write-fence.ts";
const settled = { timeout: 15_000 };
const falseNode = '{"t":2,"s":3}';
const trueNode = '{"t":2,"s":2}';

for (const control of ["running", "skill", "autonomy"] as const) {
	test(`an older ${control} held before it arrives does not replace the newer value`, async ({
		page,
		workspaceUser,
		accountId,
	}) => {
		test.setTimeout(90_000);
		await openAgent(page, workspaceUser, "support");
		await page.clock.install();
		const held = await holdWrites(page, exportName(control));
		await clickControl(page, control, "old");
		await expect.poll(() => held.length).toBe(1);
		await clickControl(page, control, "new");
		expect(held).toHaveLength(1);
		await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
		await expect.poll(() => held.length).toBe(2);
		await settle(requestFor(held, control, "new"));
		// The timeout already aborted this request, so the page never sees its response.
		await settle(requestFor(held, control, "old"), false);
		await expectCurrent(page, accountId, control);
		await page.unroute("**/*");
	});

	test(`an older ${control} that arrives first still loses to the newer value`, async ({
		page,
		workspaceUser,
		accountId,
	}) => {
		test.setTimeout(90_000);
		await openAgent(page, workspaceUser, "support");
		const held = await holdWrites(page, exportName(control));
		await clickControl(page, control, "old");
		await expect.poll(() => held.length).toBe(1);
		await clickControl(page, control, "new");
		expect(held).toHaveLength(1);
		await settle(requestFor(held, control, "old"));
		await expect.poll(() => held.length).toBe(2);
		await settle(requestFor(held, control, "new"));
		await expectCurrent(page, accountId, control);
		await page.unroute("**/*");
	});
}

test("two reloads before a write retire a held request", async ({ page, workspaceUser, accountId }) => {
	test.setTimeout(90_000);
	await openAgent(page, workspaceUser, "support");
	const first = await fenceState(page);
	let old: { url: string; body: string } | null = null;
	await page.route("**/*", async (route) => {
		const request = route.request();
		if (!old && request.method() === "POST" && serverFnExport(request.url()).startsWith("setAgentRunning")) {
			old = { url: request.url(), body: request.postData() ?? "" };
			return;
		}
		await route.continue();
	});
	await squadSwitch(page).click();
	await expect.poll(() => old !== null).toBe(true);
	await page.unroute("**/*");
	await reloadAgent(page);
	await expect(running(page)).toBeVisible();
	const second = await fenceState(page);
	expect(second.pending).toContain(first.current);
	expect(second.current).not.toBe(first.current);
	await reloadAgent(page);
	await expect(running(page)).toBeVisible();
	const third = await fenceState(page);
	expect(third.pending).toContain(first.current);
	expect(third.pending).toContain(second.current);
	expect(third.current).not.toBe(second.current);
	const turnedOff = page.waitForResponse((response) => writeBody(response.request(), "setAgentRunning", falseNode));
	await squadSwitch(page).click();
	await turnedOff;
	await expect.poll(async () => (await readAgent(accountId, "support")).isOn, settled).toBe(false);
	const turnedOn = page.waitForResponse((response) => writeBody(response.request(), "setAgentRunning", trueNode));
	await squadSwitch(page).click();
	await turnedOn;
	await expect.poll(async () => (await readAgent(accountId, "support")).isOn, settled).toBe(true);
	await expect(running(page)).toBeVisible();
	await expect.poll(async () => (await fenceState(page)).pending).not.toContain(first.current);
	await expect.poll(async () => (await fenceState(page)).pending).not.toContain(second.current);
	if (!old) throw new Error("The old request was not held.");
	expect(old.body).toContain(first.current);
	const response = await page.request.post(old.url, {
		headers: {
			"content-type": "application/json",
			"x-tsr-serverfn": "true",
			origin: "http://localhost:3000",
			referer: "http://localhost:3000/agents/support",
		},
		data: old.body,
	});
	expect(response.ok()).toBe(true);
	expect((await readAgent(accountId, "support")).isOn).toBe(true);
	await expect(running(page)).toBeVisible();
});

test("a duplicated tab released first still lets the original write win", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	test.setTimeout(120_000);
	await openAgent(page, workspaceUser, "support");
	await releaseDuplicate(page, accountId, "duplicate-first");
});

test("an original tab released first still lets the duplicate write win", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	test.setTimeout(120_000);
	await openAgent(page, workspaceUser, "support");
	await releaseDuplicate(page, accountId, "original-first");
});

function exportName(control: "running" | "skill" | "autonomy"): string {
	if (control === "running") return "setAgentRunning";
	if (control === "skill") return "setSkillEnabled";
	return "setAgentAutonomy";
}

async function holdWrites(page: Page, name: string) {
	const held: Route[] = [];
	await page.route("**/*", async (route) => {
		const request = route.request();
		if (request.method() === "POST" && serverFnExport(request.url()).startsWith(name)) {
			held.push(route);
			return;
		}
		await route.continue();
	});
	return held;
}

async function clickControl(page: Page, control: "running" | "skill" | "autonomy", which: "old" | "new") {
	if (control === "running" || control === "skill") {
		const button =
			control === "running"
				? squadSwitch(page)
				: skillRow(page, "inbox.read").getByRole("button", { name: "Skill enabled" });
		await button.click();
		return;
	}
	const label = which === "old" ? "Ask first" : "Full auto";
	await page.getByRole("group", { name: "Autonomy" }).getByRole("button", { name: label, exact: true }).click();
}

function requestFor(held: Route[], control: "running" | "skill" | "autonomy", which: "old" | "new"): Route {
	const route = held.find((item) => matches(item, control, which));
	if (!route) throw new Error(`The ${which} ${control} write was not held.`);
	return route;
}

function matches(route: Route, control: "running" | "skill" | "autonomy", which: "old" | "new"): boolean {
	const body = route.request().postData() ?? "";
	if (control === "autonomy") return body.includes(which === "old" ? "Ask first" : "Full auto");
	const node = which === "old" ? falseNode : trueNode;
	if (control === "skill") return body.includes("inbox.read") && body.includes(node);
	return body.includes(node);
}

async function settle(route: Route, observePage = true) {
	const requestPage = route.request().frame()?.page();
	if (!requestPage) throw new Error("The held write has no page.");
	const posted = route.request().postData();
	const landed =
		observePage && route.request().failure() === null
			? requestPage.waitForResponse(
					(response) => response.request().method() === "POST" && response.request().postData() === posted,
				)
			: null;
	const response = await route.fetch();
	await route.fulfill({ response });
	if (landed) await landed;
}

async function expectCurrent(page: Page, accountId: string, control: "running" | "skill" | "autonomy") {
	const stored = await readAgent(accountId, "support");
	if (control === "running") {
		expect(stored.isOn).toBe(true);
		await expect(squadSwitch(page)).toHaveAttribute("aria-pressed", "true");
		await expect(running(page)).toBeVisible();
		await expect(paused(page)).toHaveCount(0);
		return;
	}
	if (control === "skill") {
		expect(skillFlag(stored, "inbox.read")).toBe(true);
		await expect(skillRow(page, "inbox.read").getByRole("button", { name: "Skill enabled" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		return;
	}
	expect(stored.autonomy).toBe("Full auto");
	await expect(
		page.getByRole("group", { name: "Autonomy" }).getByRole("button", { name: "Full auto", exact: true }),
	).toHaveAttribute("aria-pressed", "true");
}

function writeBody(
	request: { method: () => string; url: () => string; postData: () => string | null },
	name: string,
	marker: string,
) {
	return (
		request.method() === "POST" &&
		serverFnExport(request.url()).startsWith(name) &&
		(request.postData() ?? "").includes(marker)
	);
}

async function fenceState(page: Page) {
	return page.evaluate(
		async ({ key, specifier }) => {
			const raw = sessionStorage.getItem(key);
			if (!raw) throw new Error("The tab fence was not stored.");
			const stored = JSON.parse(raw) as { current?: string; pending?: string[] };
			if (stored.current) throw new Error("The live tab id is in sessionStorage.");
			const fence = await import(specifier);
			const stamp = fence.nextWriteFence() as { tab: string; retires: string[] };
			return { current: stamp.tab as string, pending: stored.pending ?? [] };
		},
		{ key: fenceStorageKey, specifier: fenceModule },
	);
}

async function releaseDuplicate(page: Page, accountId: string, order: "duplicate-first" | "original-first") {
	const duplicate = await page.context().newPage();
	try {
		const stored = await page.evaluate((key) => sessionStorage.getItem(key), fenceStorageKey);
		if (!stored) throw new Error("The tab fence was not stored.");
		await duplicate.addInitScript(
			([key, value]) => {
				sessionStorage.setItem(key, value);
			},
			[fenceStorageKey, stored] as const,
		);
		await duplicate.goto("/agents/support");
		await expect(duplicate).toHaveTitle("Agent dashboard");
		await duplicate.getByRole("button", { name: "Squad running" }).click();
		await expect.poll(async () => (await readAgent(accountId, "support")).isOn, settled).toBe(false);
		await expect(running(page)).toBeVisible();
		const original = await fenceState(page);
		const copy = await fenceState(duplicate);
		expect(copy.current).not.toBe(original.current);
		const held: Route[] = [];
		const watch = async (route: Route) => {
			const request = route.request();
			if (request.method() === "POST" && serverFnExport(request.url()).startsWith("setAgentRunning")) {
				held.push(route);
				return;
			}
			await route.continue();
		};
		await page.route("**/*", watch);
		await duplicate.route("**/*", watch);
		await squadSwitch(page).click();
		await duplicate.getByRole("button", { name: "Squad running" }).click();
		await expect.poll(() => held.length).toBe(2);
		const originalRoute = held.find((route) => (route.request().postData() ?? "").includes(original.current));
		const duplicateRoute = held.find((route) => (route.request().postData() ?? "").includes(copy.current));
		if (!originalRoute || !duplicateRoute) throw new Error("The duplicate writes were not held.");
		const originalBody = originalRoute.request().postData() ?? "";
		const duplicateBody = duplicateRoute.request().postData() ?? "";
		expect(originalBody).toContain(falseNode);
		expect(duplicateBody).toContain(trueNode);
		expect(originalBody).not.toContain(copy.current);
		expect(duplicateBody).not.toContain(original.current);
		const first = order === "duplicate-first" ? duplicateRoute : originalRoute;
		const second = order === "duplicate-first" ? originalRoute : duplicateRoute;
		await settle(first);
		await settle(second);
		expect((await readAgent(accountId, "support")).isOn).toBe(order !== "duplicate-first");
	} finally {
		await page.unroute("**/*");
		await duplicate.close();
	}
}
