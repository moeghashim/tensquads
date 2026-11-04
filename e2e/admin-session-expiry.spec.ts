import type { Page } from "@playwright/test";

import { specialAccountCookie, specialAccountValue } from "../apps/web/src/server/special-account.ts";
import { addCompanySuperAdmin, createTestUser, deleteTestUser, removeCompanyMembership } from "./admin-clerk.ts";
import { expect, openAdmin, test } from "./admin-db.ts";
import { secretsFor } from "./support.ts";

const minute = 60 * 1000;
const leaveTimeout = 8_000;

interface ScreenCase {
	readonly name: string;
	readonly route: string;
	readonly heading: string;
	readonly module: string;
	readonly fn: string;
	readonly arg: unknown;
	readonly ready: (page: Page) => Promise<void>;
	readonly write: (page: Page) => Promise<void>;
}

const screens: readonly ScreenCase[] = [
	{
		name: "overview",
		route: "/overview",
		heading: "Good morning, Moe",
		module: "overview",
		fn: "loadOverview",
		arg: null,
		ready: async (page) => {
			await expect(page.locator("main").getByRole("button", { name: "Approve", exact: true }).first()).toBeVisible();
		},
		write: async (page) => {
			await page.locator("main").getByRole("button", { name: "Approve", exact: true }).first().click();
		},
	},
	{
		name: "rules",
		route: "/rules",
		heading: "Rules and limits",
		module: "rules",
		fn: "loadRulesPage",
		arg: null,
		ready: async (page) => {
			await expect(page.getByRole("button", { name: "Rule enabled" }).first()).toBeVisible();
		},
		write: async (page) => {
			await page.getByRole("button", { name: "Rule enabled" }).first().click();
		},
	},
	{
		name: "traffic",
		route: "/traffic",
		heading: "Squad traffic",
		module: "traffic",
		fn: "loadTraffic",
		arg: null,
		ready: async (page) => {
			await expect(page.getByRole("button", { name: "Send next event" })).toBeVisible();
		},
		write: async (page) => {
			await page.getByRole("button", { name: "Send next event" }).click();
		},
	},
	{
		name: "chat",
		route: "/chat",
		heading: "Master",
		module: "chat",
		fn: "loadChat",
		arg: null,
		ready: async (page) => {
			await expect(page.locator("#chat-input")).toBeVisible();
		},
		write: async (page) => {
			await page.locator("#chat-input").fill("Hello there");
			await page.getByRole("button", { name: "Send", exact: true }).click();
		},
	},
	{
		name: "agents",
		route: "/agents",
		heading: "Squads",
		module: "agents",
		fn: "loadAgentsPage",
		arg: null,
		ready: async (page) => {
			await expect(page.getByRole("button", { name: "Ask Master" })).toBeVisible();
		},
		write: async (page) => {
			await page.getByRole("button", { name: "Ask Master" }).click();
			await page.locator("#dock-input").fill("Hello there");
			await page.getByRole("button", { name: "Send", exact: true }).click();
		},
	},
	{
		name: "agent",
		route: "/agents/support",
		heading: "Support squad",
		module: "agent-detail",
		fn: "loadAgentDetail",
		arg: { data: "support" },
		ready: async (page) => {
			await expect(page.getByRole("button", { name: "Squad running" })).toBeVisible();
		},
		write: async (page) => {
			await page.getByRole("button", { name: "Squad running" }).click();
		},
	},
];

test("an expired support session leaves every open workspace screen", async ({ page }) => {
	test.setTimeout(300_000);
	const secrets = secretsFor(["secret"]);
	const user = await createTestUser(secrets.secret, { firstName: "Moe", lastName: "Ghashim" });
	const stayed: string[] = [];
	try {
		await addCompanySuperAdmin(secrets.secret, user.userId);
		await openAdmin(page, user);
		for (const screen of screens) {
			stayed.push(await oneVisit(page, screen, "read"));
			stayed.push(await oneVisit(page, screen, "write"));
		}
		expect(stayed.filter((item) => item.length > 0)).toEqual([]);
	} finally {
		await removeCompanyMembership(secrets.secret, user.userId);
		await deleteTestUser(secrets.secret, user.userId);
	}
});

async function oneVisit(page: Page, screen: ScreenCase, act: "read" | "write"): Promise<string> {
	await openScreen(page, screen);
	await setSpecialCookie(page, specialAccountValue("demo", Date.now() - 61 * minute));
	const problem = await actAndLeave(page, screen, act);
	return problem.length === 0 ? "" : `${screen.name} ${act}: ${problem}`;
}

async function openScreen(page: Page, screen: ScreenCase): Promise<void> {
	await setSpecialCookie(page, specialAccountValue("demo", Date.now() - 59 * minute));
	await page.goto(screen.route);
	await expect(page).toHaveURL(routePattern(screen.route));
	await expect(page.getByText("Runs 5 squads · Demo store")).toBeVisible();
	await expect(page.getByRole("heading", { name: screen.heading, exact: true })).toBeVisible();
	await screen.ready(page);
}

async function actAndLeave(page: Page, screen: ScreenCase, act: "read" | "write"): Promise<string> {
	const arrived = page.waitForURL(/\/admin\/?$/, { timeout: leaveTimeout }).then(
		() => true,
		() => false,
	);
	const called = act === "read" ? readScreen(page, screen) : screen.write(page);
	const callError = await called.then(
		() => "",
		(error: unknown) => (error instanceof Error ? error.message : "The act failed."),
	);
	if (!(await arrived)) return callError.length > 0 ? callError : `stayed on ${page.url()}`;
	return customerStillVisible(page, screen.heading);
}

async function readScreen(page: Page, screen: ScreenCase): Promise<void> {
	await page.evaluate(async (target) => {
		interface FreshRead {
			readonly data?: unknown;
			readonly headers: Record<string, string>;
			readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
		}

		function freshRead(arg: unknown): FreshRead {
			const headers = { "cache-control": "no-cache" };
			const load = (input: RequestInfo | URL, init?: RequestInit) =>
				globalThis.fetch(input, { ...init, cache: "no-store" });
			if (typeof arg === "object" && arg !== null && "data" in arg) {
				return { data: arg.data, headers, fetch: load };
			}
			return { headers, fetch: load };
		}

		function readFailure(reason: unknown): string {
			if (typeof Response !== "undefined" && reason instanceof Response) {
				const options = (reason as Response & { options?: { to?: unknown; href?: unknown } }).options;
				const to = typeof options?.to === "string" ? options.to : "";
				const href = typeof options?.href === "string" ? options.href : "";
				return `redirect ${to || href || reason.headers.get("location") || "response"}`;
			}
			if (reason instanceof Error) return reason.message;
			return "The background read failed.";
		}

		const frame = (await import(target.frame)) as {
			loadWorkspaceFrame: (options?: FreshRead) => Promise<unknown>;
		};
		const child = (await import(target.child)) as Record<string, (options?: FreshRead) => Promise<unknown>>;
		const read = child[target.fn];
		if (!read) throw new Error("The screen read is missing.");
		const options = freshRead(target.arg);
		const settled = await Promise.race([
			Promise.allSettled([frame.loadWorkspaceFrame(options), read(options)]),
			new Promise<string>((resolve) => {
				setTimeout(() => resolve("pending"), 2_000);
			}),
		]);
		if (settled === "pending") return;
		const rejected = settled.find((item) => item.status === "rejected");
		if (rejected?.status === "rejected") throw new Error(readFailure(rejected.reason));
		throw new Error("The background read fulfilled.");
	}, screenRead(screen));
}

function screenRead(screen: ScreenCase): { frame: string; child: string; fn: string; arg: unknown } {
	return {
		frame: "/src/server/workspace.ts",
		child: `/src/server/${screen.module}.ts`,
		fn: screen.fn,
		arg: screen.arg,
	};
}

async function customerStillVisible(page: Page, heading: string): Promise<string> {
	const workspace = await page.getByRole("navigation", { name: "Workspace" }).count();
	const line = await page.getByText("Runs 5 squads · Demo store").count();
	const title = await page.getByRole("heading", { name: heading, exact: true }).count();
	const admin = await page.getByRole("navigation", { name: "Platform admin" }).count();
	if (workspace === 0 && line === 0 && title === 0 && admin === 1) return "";
	return `workspace ${workspace}, customer line ${line}, heading ${title}, admin ${admin}, url ${page.url()}`;
}

function routePattern(route: string): RegExp {
	return new RegExp(`${route.replaceAll("/", "\\/")}\\/?$`);
}

async function setSpecialCookie(page: Page, value: string): Promise<void> {
	await page.context().addCookies([
		{
			name: specialAccountCookie,
			value,
			url: "http://localhost:3000",
			httpOnly: true,
			secure: true,
			sameSite: "Lax",
		},
	]);
}
