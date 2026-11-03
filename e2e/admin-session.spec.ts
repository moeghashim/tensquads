import type { Page } from "@playwright/test";

import { specialAccountCookie, specialAccountValue } from "../apps/web/src/server/special-account.ts";
import {
	addCompanySuperAdmin,
	createTestUser,
	deleteTestUser,
	removeCompanyMembership,
	setCompanyRole,
} from "./admin-clerk.ts";
import { expect, openAdmin, test } from "./admin-db.ts";
import { secretsFor, waitForHydration } from "./support.ts";

const minute = 60 * 1000;
const screens = [
	{
		module: "chat",
		fn: "loadChat",
		nav: "Chat with the master",
		route: "/chat",
		rows: "main [data-loop='chatBus'] > button",
	},
	{
		module: "agents",
		fn: "loadAgentsPage",
		nav: "Squads",
		route: "/agents",
		rows: "main [data-loop='agents'] > button",
	},
	{
		module: "traffic",
		fn: "loadTraffic",
		nav: "Squad traffic",
		route: "/traffic",
		rows: "main [data-loop='busView'] button",
	},
] as const;

test("a held frame cannot paint another account's chat, squads, or traffic", async ({ page, context }) => {
	test.setTimeout(180_000);
	const secrets = secretsFor(["secret"]);
	const user = await createTestUser(secrets.secret, { firstName: "Moe", lastName: "Ghashim" });
	const other = await context.newPage();
	try {
		await addCompanySuperAdmin(secrets.secret, user.userId);
		await openAdmin(page, user);
		for (const screen of screens) {
			await other.goto("/admin");
			await waitForHydration(other);
			await other.getByRole("button", { name: "Demo store" }).click();
			await expect(other).toHaveURL(/\/overview$/);
			await page.goto("/overview");
			await expect(page.getByText("Runs 5 squads · Demo store")).toBeVisible();
			const urls = await screenUrls(page, screen.module, screen.fn);
			const childRead = page.waitForResponse(
				(response) => response.url().includes(urls.child) && response.request().method() === "GET",
			);
			await armRace(page, urls, screen.route, screen.rows);
			await page.getByRole("button", { name: screen.nav, exact: true }).first().click();
			await (await childRead).finished();
			await other.goto("/admin");
			await waitForHydration(other);
			await other.getByRole("button", { name: "Northwind Apparel" }).click();
			await expect(other).toHaveURL(/\/overview$/);
			const before = await childGets(page);
			await page.evaluate(() => {
				(window as ReviewWindow).reviewRelease?.();
			});
			await expect(page).toHaveURL(new RegExp(`${screen.route}/?$`));
			await expect(page.getByText("Runs 14 squads · Northwind Apparel")).toBeVisible();
			await expect.poll(() => childGets(page), { timeout: 15_000 }).toBeGreaterThan(before);
			expect(await maxRows(page)).toBe(0);
			await expect(page.locator(screen.rows)).toHaveCount(0);
			await expect(page.getByText("#A-1007")).toHaveCount(0);
			await disarm(page);
		}
	} finally {
		await disarm(page);
		await other.close();
		await removeCompanyMembership(secrets.secret, user.userId);
		await deleteTestUser(secrets.secret, user.userId);
	}
});

test("a special session opens Northwind at 59 minutes and returns to /admin at 61", async ({ page }) => {
	test.setTimeout(60_000);
	const secrets = secretsFor(["secret"]);
	const user = await createTestUser(secrets.secret, { firstName: "Moe", lastName: "Ghashim" });
	try {
		await addCompanySuperAdmin(secrets.secret, user.userId);
		await openAdmin(page, user);
		const now = Date.now();
		await setSpecialCookie(page, specialAccountValue("northwind", now - 59 * minute));
		await page.goto("/overview");
		await expect(page).toHaveURL(/\/overview$/);
		await expect(page.getByText("Runs 14 squads · Northwind Apparel")).toBeVisible();
		await expect(page.getByText("Demo store")).toHaveCount(0);
		await setSpecialCookie(page, specialAccountValue("northwind", now - 61 * minute));
		await page.goto("/overview");
		await expect(page).toHaveURL(/\/admin\/?$/);
		await expect(page.getByRole("navigation", { name: "Platform admin" })).toBeVisible();
	} finally {
		await removeCompanyMembership(secrets.secret, user.userId);
		await deleteTestUser(secrets.secret, user.userId);
	}
});

test("a removed role ends admin access when the session token refreshes", async ({ page }) => {
	test.setTimeout(60_000);
	const secrets = secretsFor(["secret"]);
	const user = await createTestUser(secrets.secret, { firstName: "Moe", lastName: "Ghashim" });
	try {
		await addCompanySuperAdmin(secrets.secret, user.userId);
		await openAdmin(page, user);
		await setCompanyRole(secrets.secret, user.userId, "org:member");
		await page.waitForFunction(() => {
			const clerk = (window as { Clerk?: { loaded?: boolean } }).Clerk;
			return clerk?.loaded === true;
		});
		await page.evaluate(async () => {
			const clerk = (
				window as {
					Clerk: { session: { getToken: (options: { skipCache: boolean }) => Promise<unknown> } };
				}
			).Clerk;
			await clerk.session.getToken({ skipCache: true });
		});
		await page.goto("/admin");
		await expect(page).not.toHaveURL(/\/admin/);
		await expect(page.getByRole("navigation", { name: "Platform admin" })).toHaveCount(0);
		const accounts = await page.evaluate(async () => {
			const loaded = (await import("/src/server/admin.ts")) as {
				loadAdminAccounts: () => Promise<unknown>;
			};
			try {
				const value = await loaded.loadAdminAccounts();
				return { ok: true, list: Array.isArray(value) };
			} catch {
				return { ok: false, list: false };
			}
		});
		expect(accounts.ok).toBe(false);
		expect(accounts.list).toBe(false);
	} finally {
		await removeCompanyMembership(secrets.secret, user.userId);
		await deleteTestUser(secrets.secret, user.userId);
	}
});

async function setSpecialCookie(page: Page, value: string) {
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

async function screenUrls(page: Page, module: string, fn: string) {
	return page.evaluate(
		async (screen) => {
			const frame = (await import("/src/server/workspace.ts")) as { loadWorkspaceFrame: { url: string } };
			const child = (await import(`/src/server/${screen.module}.ts`)) as Record<string, { url: string }>;
			const loaded = child[screen.fn];
			if (!loaded) throw new Error("The screen read is missing.");
			return { frame: frame.loadWorkspaceFrame.url, child: loaded.url };
		},
		{ module, fn },
	);
}

interface ReviewWindow extends Window {
	reviewRelease?: () => void;
	reviewOriginalFetch?: typeof fetch;
	reviewChildGets?: number;
	reviewMaxRows?: number;
	reviewStop?: () => void;
}

async function armRace(page: Page, urls: { frame: string; child: string }, route: string, rows: string) {
	await page.evaluate(
		({ frame, child, route, rows }) => {
			const view = window as ReviewWindow;
			const original = window.fetch.bind(window);
			let release: () => void = () => undefined;
			const gate = new Promise<void>((resolve) => {
				release = () => resolve();
			});
			view.reviewRelease = release;
			view.reviewOriginalFetch = window.fetch;
			view.reviewChildGets = 0;
			view.reviewMaxRows = 0;
			let stop = false;
			view.reviewStop = () => {
				stop = true;
			};
			const sample = () => {
				if (stop) return;
				const path = location.pathname;
				const onRoute = path === route || path === `${route}/`;
				const header = (document.body.textContent ?? "").includes("Runs 14 squads · Northwind Apparel");
				if (onRoute && header) {
					view.reviewMaxRows = Math.max(view.reviewMaxRows ?? 0, document.querySelectorAll(rows).length);
				}
				requestAnimationFrame(sample);
			};
			requestAnimationFrame(sample);
			window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
				const stated = init?.method ?? (typeof input === "string" || input instanceof URL ? "GET" : input.method);
				const method = stated.toUpperCase();
				if (url.includes(child) && method === "GET") view.reviewChildGets = (view.reviewChildGets ?? 0) + 1;
				if (url.includes(frame)) await gate;
				return original(input, init);
			};
		},
		{ frame: urls.frame, child: urls.child, route, rows },
	);
}

async function childGets(page: Page) {
	return page.evaluate(() => (window as ReviewWindow).reviewChildGets ?? 0);
}

async function maxRows(page: Page) {
	return page.evaluate(() => (window as ReviewWindow).reviewMaxRows ?? 0);
}

async function disarm(page: Page) {
	await page
		.evaluate(() => {
			const view = window as ReviewWindow;
			view.reviewStop?.();
			view.reviewRelease?.();
			if (view.reviewOriginalFetch) window.fetch = view.reviewOriginalFetch;
		})
		.catch(() => undefined);
}
