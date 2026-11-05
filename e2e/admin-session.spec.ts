import type { Page, Route } from "@playwright/test";

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
		nav: "Chat with Petra",
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
		const accounts = await deniedAccounts(page);
		expect(accounts.ok).toBe(false);
		expect(accounts.list).toBe(false);
	} finally {
		await removeCompanyMembership(secrets.secret, user.userId);
		await deleteTestUser(secrets.secret, user.userId);
	}
});

test("a removed role is gone once the 65 second bound has passed", async ({ page }) => {
	test.setTimeout(120_000);
	const secrets = secretsFor(["secret"]);
	const user = await createTestUser(secrets.secret, { firstName: "Moe", lastName: "Ghashim" });
	try {
		await addCompanySuperAdmin(secrets.secret, user.userId);
		await openAdmin(page, user);
		const captured = await captureSessionToken(page);
		expect(captured.exp - captured.iat).toBe(60);
		const accountsUrl = await adminAccountsUrl(page);
		await setCompanyRole(secrets.secret, user.userId, "org:member");
		const seen = { count: 0 };
		await page.route(/\/_serverFn\//, async (route) => {
			await replayCapturedSession(route, accountsUrl, captured.token, seen);
		});
		const beforeAccept = seen.count;
		const accepted = await deniedAccounts(page);
		expect(seen.count).toBe(beforeAccept + 1);
		expect(accepted.ok).toBe(true);
		expect(accepted.list).toBe(true);
		// The bound is 65 seconds: the 60-second token plus Clerk's 5-second clock allowance.
		// One second past that bound, the captured token must be rejected. This wait is that assertion.
		const roleRemovalBoundMs = 65_000;
		const remaining = captured.iat * 1000 + roleRemovalBoundMs + 1_000 - Date.now();
		if (remaining > 0) {
			await new Promise((resolve) => {
				setTimeout(resolve, remaining);
			});
		}
		const beforeRefuse = seen.count;
		const refused = await deniedAccounts(page);
		expect(seen.count).toBe(beforeRefuse + 1);
		expect(refused.ok).toBe(false);
		expect(refused.list).toBe(false);
	} finally {
		await removeCompanyMembership(secrets.secret, user.userId);
		await deleteTestUser(secrets.secret, user.userId);
	}
});

async function captureSessionToken(page: Page): Promise<{ token: string; iat: number; exp: number }> {
	const captured = await page.evaluate(async () => {
		const clerk = (
			window as {
				Clerk: { session: { getToken: (options: { skipCache: boolean }) => Promise<string | null> } };
			}
		).Clerk;
		const token = await clerk.session.getToken({ skipCache: true });
		if (typeof token !== "string" || token.length === 0) return null;
		const part = token.split(".")[1] ?? "";
		const padded = part.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (part.length % 4)) % 4);
		const payload = JSON.parse(atob(padded)) as { iat?: number; exp?: number };
		return { token, iat: payload.iat ?? 0, exp: payload.exp ?? 0 };
	});
	if (!captured) throw new Error("The session token is missing.");
	return captured;
}

async function adminAccountsUrl(page: Page): Promise<string> {
	const url = await page.evaluate(async (specifier: string) => {
		const loaded = (await import(specifier)) as { loadAdminAccounts: { url: string } };
		return loaded.loadAdminAccounts.url;
	}, "/src/server/admin.ts");
	if (url.length === 0) throw new Error("The accounts read is missing.");
	return url;
}

async function replayCapturedSession(route: Route, accountsUrl: string, token: string, seen: { count: number }) {
	const request = route.request();
	const path = request.url().split("?")[0] ?? "";
	if (request.method() !== "GET" || !path.includes(accountsUrl)) {
		await route.continue();
		return;
	}
	seen.count += 1;
	const headers = { ...request.headers() };
	headers.cookie = sessionCookie(headers.cookie, token);
	delete headers.authorization;
	const response = await route.fetch({ headers, maxRedirects: 0 });
	if (response.status() >= 300 && response.status() < 400) {
		await route.fulfill({ status: 401, body: "" });
		return;
	}
	await route.fulfill({ response });
}

function sessionCookie(header: string | undefined, token: string): string {
	const parts = (header ?? "")
		.split(";")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
	let replaced = false;
	const kept: string[] = [];
	for (const part of parts) {
		const name = cookieName(part);
		if (name === "__refresh" || name.startsWith("__refresh_")) continue;
		if (name === "__session" || name.startsWith("__session_")) {
			kept.push(`${name}=${token}`);
			replaced = true;
			continue;
		}
		kept.push(part);
	}
	if (!replaced) kept.push(`__session=${token}`);
	return kept.join("; ");
}

function cookieName(part: string): string {
	const split = part.indexOf("=");
	if (split <= 0) return "";
	return part.slice(0, split);
}

async function deniedAccounts(page: Page) {
	return page.evaluate(async (specifier: string) => {
		const loaded = (await import(specifier)) as {
			loadAdminAccounts: () => Promise<unknown>;
		};
		try {
			const value = await loaded.loadAdminAccounts();
			return { ok: true, list: Array.isArray(value) };
		} catch {
			return { ok: false, list: false };
		}
	}, "/src/server/admin.ts");
}

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
			const frame = (await import(screen.specifier)) as { loadWorkspaceFrame: { url: string } };
			const child = (await import(`/src/server/${screen.module}.ts`)) as Record<string, { url: string }>;
			const loaded = child[screen.fn];
			if (!loaded) throw new Error("The screen read is missing.");
			return { frame: frame.loadWorkspaceFrame.url, child: loaded.url };
		},
		{ module, fn, specifier: "/src/server/workspace.ts" },
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
				if (!stop) noteRows();
				requestAnimationFrame(sample);
			};
			function noteRows(): void {
				if (!onMeasuredRoute(location.pathname)) return;
				if (!northwindHeader()) return;
				view.reviewMaxRows = Math.max(shownRows(), document.querySelectorAll(rows).length);
			}
			function onMeasuredRoute(path: string): boolean {
				if (path === route) return true;
				return path === `${route}/`;
			}
			function northwindHeader(): boolean {
				const text = document.body.textContent;
				if (!text) return false;
				return text.includes("Runs 14 squads · Northwind Apparel");
			}
			function shownRows(): number {
				if (view.reviewMaxRows === undefined) return 0;
				return view.reviewMaxRows;
			}
			requestAnimationFrame(sample);
			window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = requestUrl(input);
				const method = requestMethod(input, init);
				noteChildGet(url, method);
				if (url.includes(frame)) await gate;
				return original(input, init);
			};
			function requestUrl(input: RequestInfo | URL): string {
				if (typeof input === "string") return input;
				if (input instanceof URL) return input.href;
				return input.url;
			}
			function requestMethod(input: RequestInfo | URL, init: RequestInit | undefined): string {
				const stated = statedMethod(input, init);
				return stated.toUpperCase();
			}
			function statedMethod(input: RequestInfo | URL, init: RequestInit | undefined): string {
				const named = initMethod(init);
				if (named) return named;
				return defaultMethod(input);
			}
			function initMethod(init: RequestInit | undefined): string | undefined {
				if (!init) return undefined;
				return init.method;
			}
			function defaultMethod(input: RequestInfo | URL): string {
				if (typeof input === "string") return "GET";
				if (input instanceof URL) return "GET";
				return input.method;
			}
			function noteChildGet(url: string, method: string): void {
				if (!isChildGet(url, method)) return;
				view.reviewChildGets = nextCount(view.reviewChildGets);
			}
			function isChildGet(url: string, method: string): boolean {
				return url.includes(child) && method === "GET";
			}
			function nextCount(value: number | undefined): number {
				if (value === undefined) return 1;
				return value + 1;
			}
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
