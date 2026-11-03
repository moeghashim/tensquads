import type { Page, Route } from "@playwright/test";

import { expect, openWorkspace, test } from "./workspace.ts";

const refreshBody = JSON.stringify({
	t: 10,
	i: 0,
	p: {
		k: ["error"],
		v: [{ t: 25, i: 1, s: { message: { t: 1, s: "The session needs a refresh." } }, c: "$TSR/Error" }],
	},
	o: 0,
});

const settled = { timeout: 15_000 };

test("one refresh keeps the signed-in workspace and reloads once", async ({ page, workspaceUser }) => {
	test.setTimeout(90_000);
	await openWorkspace(page, workspaceUser);
	await watchRefresh(page);
	await failWorkspaceFrame(page, 1);
	await page
		.getByRole("navigation", { name: "Workspace" })
		.getByRole("button", { name: "Squads", exact: true })
		.click();
	await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible(settled);
	await expect(page).not.toHaveURL(/\/signin/, settled);
	await expect(page).not.toHaveTitle("Sign in", settled);
	await expect.poll(() => refreshCounts(page), settled).toEqual({ reloads: 1, freshTokens: 1 });
});

test("a second refresh in the same action opens sign-in", async ({ page, workspaceUser }) => {
	test.setTimeout(90_000);
	await openWorkspace(page, workspaceUser);
	await watchRefresh(page);
	await failWorkspaceFrame(page, 2);
	await page
		.getByRole("navigation", { name: "Workspace" })
		.getByRole("button", { name: "Squads", exact: true })
		.click();
	await expect(page).toHaveURL(/\/signin$/, settled);
	await expect(page).toHaveTitle("Sign in", settled);
	await expect.poll(() => refreshCounts(page), settled).toEqual({ reloads: 1, freshTokens: 1 });
});

test("a signed-out client with an unexpired session cookie opens sign-in", async ({ page, workspaceUser }) => {
	test.setTimeout(90_000);
	await openWorkspace(page, workspaceUser);
	await watchRefresh(page, true);
	await sendSignedOutClient(page);
	await page
		.getByRole("navigation", { name: "Workspace" })
		.getByRole("button", { name: "Squads", exact: true })
		.click();
	await expect(page).toHaveURL(/\/signin$/, settled);
	await expect(page).toHaveTitle("Sign in", settled);
});

function serverFnExport(url: string): string {
	const id = new URL(url).pathname.split("/").pop() ?? "";
	try {
		const parsed: unknown = JSON.parse(Buffer.from(id, "base64url").toString("utf8"));
		if (typeof parsed === "object" && parsed !== null && "export" in parsed && typeof parsed.export === "string") {
			return parsed.export;
		}
	} catch {
		// A production id is a hash. The dev server id is base64 JSON.
	}
	return "";
}

async function failWorkspaceFrame(page: Page, times: number) {
	let left = times;
	await page.route(/\/_serverFn\//, async (route) => {
		const request = route.request();
		if (left > 0 && request.method() === "GET" && serverFnExport(request.url()).startsWith("loadWorkspaceFrame")) {
			left -= 1;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				headers: { "x-tss-serialized": "true" },
				body: refreshBody,
			});
			return;
		}
		await route.continue();
	});
}

async function sendSignedOutClient(page: Page) {
	const current = await page.context().cookies();
	const targets = current.filter(
		(cookie) => cookie.name === "__client_uat" || cookie.name.startsWith("__client_uat_"),
	);
	if (targets.length === 0) {
		await page.context().addCookies([{ name: "__client_uat", value: "0", url: new URL(page.url()).origin }]);
	} else {
		await page.context().addCookies(targets.map((cookie) => ({ ...cookie, value: "0" })));
	}
	await page.route(/\/_serverFn\//, async (route) => {
		await continueWithSignedOutClient(route);
	});
}

async function continueWithSignedOutClient(route: Route) {
	const headers = { ...route.request().headers() };
	const parts = (headers.cookie ?? "").split(";").map((part) => {
		const trimmed = part.trim();
		const split = trimmed.indexOf("=");
		if (split <= 0) return part;
		const name = trimmed.slice(0, split);
		if (name === "__client_uat" || name.startsWith("__client_uat_")) return `${name}=0`;
		return part;
	});
	if (!parts.some((part) => part.trim().startsWith("__client_uat"))) parts.push("__client_uat=0");
	headers.cookie = parts.filter((part) => part.trim().length > 0).join("; ");
	await route.continue({ headers });
}

async function watchRefresh(page: Page, rejectFreshToken = false) {
	await page.evaluate((rejectFresh) => {
		const browser = window as Window & {
			__reloadCount?: number;
			__tokenCalls?: Array<{ skipCache?: boolean } | null>;
			__TSR_ROUTER__?: { invalidate: (...args: unknown[]) => unknown };
			Clerk?: {
				session?: {
					getToken: (options?: { skipCache?: boolean }) => Promise<string | null>;
				} | null;
			};
		};
		const router = browser.__TSR_ROUTER__;
		const session = browser.Clerk?.session;
		if (!router || !session) throw new Error("The signed-in workspace is not ready.");
		const invalidate = router.invalidate.bind(router);
		const getToken = session.getToken.bind(session);
		browser.__reloadCount = 0;
		browser.__tokenCalls = [];
		router.invalidate = (...args) => {
			browser.__reloadCount = (browser.__reloadCount ?? 0) + 1;
			return invalidate(...args);
		};
		session.getToken = (options) => {
			browser.__tokenCalls?.push(options ?? null);
			if (rejectFresh && options?.skipCache === true) {
				return Promise.reject(new Error("The client is signed out."));
			}
			return getToken(options);
		};
	}, rejectFreshToken);
}

async function refreshCounts(page: Page) {
	return page.evaluate(() => {
		const browser = window as Window & {
			__reloadCount?: number;
			__tokenCalls?: Array<{ skipCache?: boolean } | null>;
		};
		const freshTokens = (browser.__tokenCalls ?? []).filter((options) => options?.skipCache === true).length;
		return { reloads: browser.__reloadCount ?? 0, freshTokens };
	});
}
