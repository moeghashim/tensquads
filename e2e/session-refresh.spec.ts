import type { Page } from "@playwright/test";

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
	const reads = await sendSignedOutClient(page);
	await page
		.getByRole("navigation", { name: "Workspace" })
		.getByRole("button", { name: "Squads", exact: true })
		.click();
	await expect(page).toHaveURL(/\/signin$/, settled);
	await expect(page).toHaveTitle("Sign in", settled);
	// The read must carry the jar. A header override does not reach the server.
	await expect
		.poll(() => reads.filter((read) => read.hasSession && read.uat.length > 0).length, settled)
		.toBeGreaterThan(0);
	const delivered = reads.filter((read) => read.hasSession);
	expect(delivered.length).toBeGreaterThan(0);
	for (const read of delivered) {
		expect(read.uat.length).toBeGreaterThan(0);
		expect(read.uat.every((value) => value === "0")).toBe(true);
	}
	console.log(`serverFn client uat: ${delivered.flatMap((read) => read.uat).join(" ")}`);
});

test("Tab during a token refresh still reloads once", async ({ page, workspaceUser }) => {
	test.setTimeout(90_000);
	await openWorkspace(page, workspaceUser);
	await watchRefresh(page);
	await holdFreshToken(page);
	await failWorkspaceFrame(page, 1);
	await page
		.getByRole("navigation", { name: "Workspace" })
		.getByRole("button", { name: "Squads", exact: true })
		.click();
	await expect.poll(() => tokenWaiting(page), settled).toBe(true);
	await page.keyboard.press("Tab");
	await page.mouse.move(12, 24);
	await releaseFreshToken(page);
	await expect.poll(() => refreshCounts(page), settled).toEqual({ reloads: 1, freshTokens: 1 });
	await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible(settled);
	await expect(page.getByText("Something went wrong!")).toHaveCount(0);
	await expect(page).not.toHaveURL(/\/signin/, settled);
});

test("browser Back starts a new refresh", async ({ page, workspaceUser }) => {
	test.setTimeout(90_000);
	await openWorkspace(page, workspaceUser);
	await watchRefresh(page);
	await failWorkspaceFrame(page, 1);
	await page
		.getByRole("navigation", { name: "Workspace" })
		.getByRole("button", { name: "Squads", exact: true })
		.click();
	await expect.poll(() => refreshCounts(page), settled).toEqual({ reloads: 1, freshTokens: 1 });
	await expect(page).toHaveURL(/\/agents$/, settled);
	await expect(page.getByRole("heading", { name: "Squads", exact: true })).toBeVisible(settled);
	await page.unroute(/\/_serverFn\//);
	await failWorkspaceFrame(page, 1);
	await page.goBack({ waitUntil: "commit", timeout: 15_000 });
	await expect.poll(() => refreshCounts(page), settled).toEqual({ reloads: 2, freshTokens: 2 });
	await expect(page).toHaveURL(/\/overview$/, settled);
	await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible(settled);
});

test("browser Forward starts a new refresh", async ({ page, workspaceUser }) => {
	test.setTimeout(90_000);
	await openWorkspace(page, workspaceUser);
	await watchRefresh(page);
	await page
		.getByRole("navigation", { name: "Workspace" })
		.getByRole("button", { name: "Squads", exact: true })
		.click();
	await expect(page).toHaveURL(/\/agents$/, settled);
	await expect(page.getByRole("heading", { name: "Squads", exact: true })).toBeVisible(settled);
	await page.goBack({ waitUntil: "commit", timeout: 15_000 });
	await expect(page).toHaveURL(/\/overview$/, settled);
	await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible(settled);
	await expect.poll(() => routerStatus(page), settled).toBe("idle");
	await expect.poll(() => refreshCounts(page), settled).toEqual({ reloads: 0, freshTokens: 0 });
	// Spend the open allowance on this page. A reload is not a new navigation.
	await failWorkspaceFrame(page, 1);
	await reloadCachedRoutes(page);
	await expect.poll(() => refreshCounts(page), settled).toEqual({ reloads: 2, freshTokens: 1 });
	await expect(page).toHaveURL(/\/overview$/, settled);
	await expect.poll(() => routerStatus(page), settled).toBe("idle");
	await page.unroute(/\/_serverFn\//);
	// The recovery reloaded this page and left the cached Squads match fresh.
	await markRouteCacheStale(page);
	await failWorkspaceFrame(page, 1);
	await page.goForward({ waitUntil: "commit", timeout: 15_000 });
	await expect.poll(() => refreshCounts(page), settled).toEqual({ reloads: 3, freshTokens: 2 });
	await expect(page).toHaveURL(/\/agents$/, settled);
	await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible(settled);
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

interface DeliveredCookie {
	readonly uat: readonly string[];
	readonly hasSession: boolean;
}

// Chromium sends the cookie jar. route.continue cannot replace the Cookie header.
async function sendSignedOutClient(page: Page): Promise<DeliveredCookie[]> {
	await holdSignedOutJar(page);
	await writeSignedOutJar(page);
	const reads: DeliveredCookie[] = [];
	await page.route(/\/_serverFn\//, async (route) => {
		await writeSignedOutJar(page);
		const pendingHeaders = route.request().allHeaders();
		await route.continue();
		if (route.request().method() !== "GET") return;
		const headers = await pendingHeaders;
		reads.push(readDeliveredCookie(headers.cookie ?? ""));
	});
	return reads;
}

async function writeSignedOutJar(page: Page) {
	const origin = new URL(page.url()).origin;
	const current = await page.context().cookies();
	const targets = current.filter(
		(cookie) => cookie.name === "__client_uat" || cookie.name.startsWith("__client_uat_"),
	);
	if (targets.length === 0) {
		await page.context().addCookies([{ name: "__client_uat", value: "0", url: origin }]);
		return;
	}
	await page.context().addCookies(targets.map((cookie) => ({ ...cookie, value: "0" })));
}

// The signed-in Clerk client writes a fresh timestamp into the jar. Keep that value at 0.
async function holdSignedOutJar(page: Page) {
	await page.evaluate(() => {
		const prototype = Document.prototype;
		const descriptor = Object.getOwnPropertyDescriptor(prototype, "cookie");
		if (!descriptor?.get || !descriptor.set) throw new Error("The cookie setter is missing.");
		const read = descriptor.get;
		const write = descriptor.set;
		Object.defineProperty(prototype, "cookie", {
			configurable: true,
			enumerable: descriptor.enumerable ?? true,
			get() {
				return read.call(this);
			},
			set(value: string) {
				write.call(this, forceSignedOutUat(String(value)));
			},
		});
		const store = (window as Window & { cookieStore?: { set: (...args: unknown[]) => Promise<unknown> } })
			.cookieStore;
		if (store && typeof store.set === "function") {
			const set = store.set.bind(store);
			store.set = (...args: unknown[]) => set(...forceStoreArgs(args));
		}

		function forceSignedOutUat(value: string): string {
			const parts = value.split(";");
			const first = parts[0] ?? "";
			const split = first.indexOf("=");
			if (split <= 0) return value;
			const name = first.slice(0, split).trim();
			if (name !== "__client_uat" && !name.startsWith("__client_uat_")) return value;
			parts[0] = `${name}=0`;
			return parts.join(";");
		}

		function forceStoreArgs(args: unknown[]): unknown[] {
			const first = args[0];
			if (typeof first === "string" && (first === "__client_uat" || first.startsWith("__client_uat_"))) {
				return [first, "0"];
			}
			if (typeof first === "object" && first !== null && "name" in first) {
				const name = String((first as { name: unknown }).name);
				if (name === "__client_uat" || name.startsWith("__client_uat_")) {
					return [{ ...first, name, value: "0" }];
				}
			}
			return args;
		}
	});
}

function readDeliveredCookie(cookie: string): DeliveredCookie {
	const uat: string[] = [];
	let hasSession = false;
	for (const part of cookie.split(";")) {
		const trimmed = part.trim();
		const split = trimmed.indexOf("=");
		if (split <= 0) continue;
		const name = trimmed.slice(0, split);
		const value = trimmed.slice(split + 1);
		if (name === "__client_uat" || name.startsWith("__client_uat_")) uat.push(value);
		if ((name === "__session" || name.startsWith("__session_")) && value.length > 0) hasSession = true;
	}
	return { uat, hasSession };
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
		const clerk = browser.Clerk;
		if (!router || !clerk?.session) throw new Error("The signed-in workspace is not ready.");
		const invalidate = router.invalidate.bind(router);
		browser.__reloadCount = 0;
		browser.__tokenCalls = [];
		router.invalidate = (...args) => {
			browser.__reloadCount = (browser.__reloadCount ?? 0) + 1;
			return invalidate(...args);
		};
		let current = clerk.session ?? null;
		const wrapped = new WeakSet<(options?: { skipCache?: boolean }) => Promise<string | null>>();
		const wrap = (session: NonNullable<typeof current>) => {
			if (wrapped.has(session.getToken)) return session;
			const getToken = session.getToken.bind(session);
			const replacement = (options?: { skipCache?: boolean }) => {
				browser.__tokenCalls?.push(options ?? null);
				if (rejectFresh && options?.skipCache === true) {
					return Promise.reject(new Error("The client is signed out."));
				}
				return getToken(options);
			};
			wrapped.add(replacement);
			session.getToken = replacement;
			return session;
		};
		if (current) wrap(current);
		Object.defineProperty(clerk, "session", {
			configurable: true,
			enumerable: true,
			get() {
				if (!current) return current;
				// A signed-out simulation has to survive Clerk replacing the session or getToken.
				if (rejectFresh) return wrap(current);
				return current;
			},
			set(next) {
				current = next;
				if (next && rejectFresh) wrap(next);
			},
		});
	}, rejectFreshToken);
}

async function holdFreshToken(page: Page) {
	await page.evaluate(() => {
		const browser = window as Window & {
			__releaseToken?: () => void;
			__tokenWaiting?: boolean;
			Clerk?: {
				session?: {
					getToken: (options?: { skipCache?: boolean }) => Promise<string | null>;
				} | null;
			};
		};
		const session = browser.Clerk?.session;
		if (!session) throw new Error("The signed-in workspace is not ready.");
		const getToken = session.getToken.bind(session);
		session.getToken = (options) => {
			if (options?.skipCache !== true) return getToken(options);
			browser.__tokenWaiting = true;
			return new Promise((resolve, reject) => {
				browser.__releaseToken = () => {
					void getToken(options).then(resolve, reject);
				};
			});
		};
	});
}

async function tokenWaiting(page: Page) {
	return page.evaluate(() => Boolean((window as Window & { __tokenWaiting?: boolean }).__tokenWaiting));
}

async function releaseFreshToken(page: Page) {
	await page.evaluate(() => {
		const release = (window as Window & { __releaseToken?: () => void }).__releaseToken;
		if (!release) throw new Error("The token refresh is not waiting.");
		release();
	});
}

async function routerStatus(page: Page) {
	return page.evaluate(() => {
		const router = (window as Window & { __TSR_ROUTER__?: { stores?: { status?: { get(): string } } } })
			.__TSR_ROUTER__;
		return router?.stores?.status?.get() ?? "";
	});
}

async function reloadCachedRoutes(page: Page) {
	await page.evaluate(async () => {
		const router = (window as Window & { __TSR_ROUTER__?: { invalidate: () => Promise<unknown> } }).__TSR_ROUTER__;
		if (!router) throw new Error("The router is missing.");
		await router.invalidate();
	});
}

async function markRouteCacheStale(page: Page) {
	await page.evaluate(() => {
		const router = (window as Window & { __TSR_ROUTER__?: { _cache?: Map<string, { invalid?: boolean }> } })
			.__TSR_ROUTER__;
		const cache = router?._cache;
		if (!cache || cache.size === 0) throw new Error("The route cache is missing.");
		for (const match of cache.values()) match.invalid = true;
	});
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
