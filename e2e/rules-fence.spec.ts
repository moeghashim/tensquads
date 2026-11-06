import type { Page, Route } from "@playwright/test";
import { openPostgres, schema } from "@tensquads/adapters";
import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";
import { eq } from "drizzle-orm";

import { appOrigin } from "../scripts/e2e-port.mjs";
import { postedField } from "./fence-body.ts";
import { secretsFor } from "./support.ts";
import { expect, openWorkspace, test } from "./workspace.ts";

const adCap = "policy.daily_ad_cap";
const monday = "it is Monday at 8:00";
const rulesQueueModule = "/src/screens/rules/write-queue.ts";
const rulesLoaderModule = "/src/screens/rules/loader.ts";
const fenceStorageKey = "tensquads.writeFence";
const fenceModule = "/src/write-fence.ts";

test("an older ad cap held before it arrives does not replace the newer cap", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	test.setTimeout(60_000);
	await openRules(page, workspaceUser);
	await page.clock.install();
	const held = await holdPosts(page, adCap);
	await page.locator("#lim-ads").fill("240");
	await expect.poll(() => held.length).toBe(1);
	await page.locator("#lim-ads").fill("260");
	await expect(page.locator("#lim-ads")).toHaveValue("260");
	expect(held).toHaveLength(1);
	await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
	await expect.poll(() => held.length).toBe(2);
	await settle(requestFor(held, "260"));
	await settle(requestFor(held, "240"));
	await expect(page.locator("#lim-ads")).toHaveValue("260");
	await expectStored(accountId, adCap, 260);
	await page.unroute("**/*");
});

test("an older ad cap that arrives first still loses to the newer cap", async ({ page, workspaceUser, accountId }) => {
	await openRules(page, workspaceUser);
	const held = await holdPosts(page, adCap);
	await page.locator("#lim-ads").fill("240");
	await expect.poll(() => held.length).toBe(1);
	await page.locator("#lim-ads").fill("260");
	await expect(page.locator("#lim-ads")).toHaveValue("260");
	expect(held).toHaveLength(1);
	await settle(requestFor(held, "240"));
	await expect.poll(() => held.length).toBe(2);
	await settle(requestFor(held, "260"));
	await expect(page.locator("#lim-ads")).toHaveValue("260");
	await expectStored(accountId, adCap, 260);
	await page.unroute("**/*");
});

test("an older rule switch held before it arrives does not replace the newer switch", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	test.setTimeout(60_000);
	await openRules(page, workspaceUser);
	const control = mondaySwitch(page);
	await clickRule(page, true);
	await expect(control).toHaveAttribute("aria-pressed", "true");
	await expectRuleOn(accountId, true);
	await page.clock.install();
	const held = await holdPosts(page, "r5");
	await control.click();
	await expect.poll(() => held.length).toBe(1);
	expect(switchOn(held[0])).toBe(false);
	await control.click();
	await expect(control).toHaveAttribute("aria-pressed", "true");
	expect(held).toHaveLength(1);
	await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
	await expect.poll(() => held.length).toBe(2);
	await settle(held.find((route) => switchOn(route) === true) as Route);
	await settle(held.find((route) => switchOn(route) === false) as Route);
	await expect(control).toHaveAttribute("aria-pressed", "true");
	await expectRuleOn(accountId, true);
	await page.unroute("**/*");
});

test("an older rule switch that arrives first still loses to the newer switch", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	await openRules(page, workspaceUser);
	const control = mondaySwitch(page);
	await clickRule(page, true);
	await expect(control).toHaveAttribute("aria-pressed", "true");
	await expectRuleOn(accountId, true);
	const held = await holdPosts(page, "r5");
	await control.click();
	await expect.poll(() => held.length).toBe(1);
	await control.click();
	await expect(control).toHaveAttribute("aria-pressed", "true");
	expect(held).toHaveLength(1);
	await settle(held[0] as Route);
	await expect.poll(() => held.length).toBe(2);
	await settle(held[1] as Route);
	await expect(control).toHaveAttribute("aria-pressed", "true");
	await expectRuleOn(accountId, true);
	await page.unroute("**/*");
});

test("a timed-out add lands as one row", async ({ page, workspaceUser, accountId }) => {
	test.setTimeout(60_000);
	await openRules(page, workspaceUser);
	await expect(page.locator("[data-loop='rules'] > div")).toHaveCount(5);
	const before = await ruleCount(accountId);
	await page.clock.install();
	const held = await holdPosts(page, "Queue add once");
	await page.getByLabel("Then", { exact: true }).fill("Queue add once");
	await page.getByRole("button", { name: "Add rule", exact: true }).click();
	await expect.poll(() => held.length).toBe(1);
	expect(held[0]?.request().postData() ?? "").not.toContain('"tab"');
	await page.clock.fastForward(PENDING_TASK_WINDOW_MS + 1);
	await delay(300);
	expect(held).toHaveLength(1);
	await settle(held[0] as Route);
	await expect.poll(() => ruleCount(accountId)).toBe(before + 1);
	await page.unroute("**/*");
	await page.clock.resume();
	await page.reload();
	await expect(page.getByText("then Queue add once", { exact: true })).toHaveCount(1);
	await expect(page.locator("[data-loop='rules'] > div")).toHaveCount(6);
});

for (const kind of ["lim-refund", "lim-ads", "lim-reorder", "rule", "add"] as const) {
	test(`a failed recovery read keeps the rules screen and the next ${kind} write reads once`, async ({
		page,
		workspaceUser,
	}) => {
		test.setTimeout(90_000);
		const rulesUrl = await captureRulesUrl(page, workspaceUser);
		const gate = await failFirstPostAndRead(page, rulesUrl);
		await act(page, kind);
		await expect.poll(() => gate.readFailed).toBe(true);
		await expect(page.getByRole("heading", { name: "Rules and limits", exact: true })).toBeVisible();
		await restored(page, kind);
		expect(gate.reads).toBe(1);
		// The failed read has to be recorded before the next write, or that write joins it.
		await expect.poll(() => recoveryGeneration(page)).toBeGreaterThanOrEqual(2);
		const accepted = await writeCounter(page);
		await act(page, kind);
		// The click has to send the write. The read starts when the client accepts the response.
		await expect.poll(() => gate.writesSeen).toBe(2);
		await expect.poll(() => writeCounter(page), { timeout: 25_000 }).toBeGreaterThan(accepted);
		await expect.poll(() => gate.reads).toBe(2);
		await ended(page, kind);
		await delay(500);
		expect(gate.reads).toBe(2);
	});
}

test("a committed ad cap whose response is lost advances the write counter", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	await openRules(page, workspaceUser);
	await expect(page.locator("#lim-ads")).toHaveValue("200");
	const before = await writeCounter(page);
	let lost = false;
	await page.route("**/*", async (route) => {
		const request = route.request();
		if (!lost && request.method() === "POST" && (request.postData() ?? "").includes(adCap)) {
			const response = await route.fetch();
			lost = true;
			if (!response.ok()) {
				throw new Error(`The ad cap write failed with status ${response.status()}.`);
			}
			await route.fulfill({ status: 500, contentType: "text/plain", body: "Response lost" });
			return;
		}
		await route.continue();
	});
	await page.locator("#lim-ads").fill("240");
	await expect.poll(() => lost).toBe(true);
	await expectStored(accountId, adCap, 240);
	await expect.poll(() => writeCounter(page)).toBeGreaterThan(before);
});

test("an old read does not replace the snapshot kept after a lost ad cap response", async ({ page, workspaceUser }) => {
	test.setTimeout(90_000);
	await openRules(page, workspaceUser);
	let held: Route | null = null;
	let oldResponse: Awaited<ReturnType<Route["fetch"]>> | null = null;
	let rulesUrl = "";
	let postLost = false;
	let failReads = false;
	let failedReads = 0;
	await page.route("**/*", async (route) => {
		const request = route.request();
		if (request.method() === "GET" && request.url().includes("/_serverFn/")) {
			const url = request.url().split("?")[0] ?? "";
			if (failReads && url === rulesUrl) {
				failedReads += 1;
				await route.fulfill({ status: 500, contentType: "text/plain", body: "read failed" });
				return;
			}
			if (!held) {
				const response = await route.fetch();
				const body = await response.text();
				if (body.includes(adCap)) {
					held = route;
					oldResponse = response;
					rulesUrl = url;
					return;
				}
				await route.fulfill({ response });
				return;
			}
		}
		if (!postLost && request.method() === "POST" && (request.postData() ?? "").includes(adCap)) {
			const response = await route.fetch();
			if (!response.ok()) {
				throw new Error(`The ad cap write failed with status ${response.status()}.`);
			}
			await route.fulfill({ status: 500, contentType: "text/plain", body: "lost response" });
			postLost = true;
			return;
		}
		await route.continue();
	});
	await page.evaluate(async (specifier) => {
		const loader = await import(specifier);
		(window as Window & { __oldRead?: Promise<unknown> }).__oldRead = loader.loadRulesSnapshot();
	}, rulesLoaderModule);
	await expect.poll(() => held !== null).toBe(true);
	await page.locator("#lim-ads").fill("240");
	await expect.poll(() => postLost).toBe(true);
	await expect
		.poll(() =>
			page.evaluate(async (specifier) => {
				const queue = await import(specifier);
				return queue.rulesWriteCounter() > 0 && queue.readNeeded() === false;
			}, rulesQueueModule),
		)
		.toBe(true);
	await expect(page.locator("#lim-ads")).toHaveValue("240");
	if (!held || !oldResponse) {
		throw new Error("The old read was not held.");
	}
	await held.fulfill({ response: oldResponse });
	const returned = await page.evaluate(async () => {
		const snapshot = await (window as Window & { __oldRead?: Promise<{ limits: { key: string; value: number }[] }> })
			.__oldRead;
		return snapshot?.limits.find((limit) => limit.key === "policy.daily_ad_cap")?.value;
	});
	expect(returned).toBe(240);
	failReads = true;
	await page.evaluate(async () => {
		const router = (
			window as unknown as {
				__TSR_ROUTER__?: { invalidate: (options: { sync: boolean }) => Promise<unknown> };
			}
		).__TSR_ROUTER__;
		if (!router) {
			throw new Error("The router is missing.");
		}
		await router.invalidate({ sync: true });
	});
	await expect.poll(() => failedReads).toBe(1);
	await expect(page.locator("#lim-ads")).toHaveValue("240");
});

test("two reloads before a write retire a held request", async ({ page, workspaceUser, accountId }) => {
	test.setTimeout(90_000);
	await openRules(page, workspaceUser);
	const first = await fenceState(page);
	let old: { url: string; body: string } | null = null;
	await page.route("**/*", async (route) => {
		const request = route.request();
		if (!old && request.method() === "POST" && (request.postData() ?? "").includes(adCap)) {
			old = { url: request.url(), body: request.postData() ?? "" };
			return;
		}
		await route.continue();
	});
	await page.locator("#lim-ads").fill("240");
	await expect.poll(() => old !== null).toBe(true);
	await page.unroute("**/*");
	await page.reload();
	await expect(page.locator("#lim-ads")).toHaveValue("200");
	await whenSliderReady(page);
	const second = await fenceState(page);
	expect(second.pending).toContain(first.current);
	expect(second.current).not.toBe(first.current);
	await page.reload();
	await expect(page.locator("#lim-ads")).toHaveValue("200");
	await whenSliderReady(page);
	const third = await fenceState(page);
	expect(third.pending).toContain(first.current);
	expect(third.pending).toContain(second.current);
	expect(third.current).not.toBe(second.current);
	const written = page.waitForResponse((response) => {
		const request = response.request();
		const body = request.postData() ?? "";
		return request.method() === "POST" && postedField(body, "key") === adCap && postedField(body, "value") === 260;
	});
	await page.locator("#lim-ads").fill("260");
	await written;
	await expectStored(accountId, adCap, 260);
	await expect.poll(async () => (await fenceState(page)).pending).not.toContain(first.current);
	await expect.poll(async () => (await fenceState(page)).pending).not.toContain(second.current);
	if (!old) {
		throw new Error("The old request was not held.");
	}
	expect(old.body).toContain(first.current);
	const response = await page.request.post(old.url, {
		headers: {
			"content-type": "application/json",
			"x-tsr-serverfn": "true",
			origin: appOrigin(),
			referer: `${appOrigin()}/rules`,
		},
		data: old.body,
	});
	expect(response.ok()).toBe(true);
	await expectStored(accountId, adCap, 260);
});

test("a duplicated tab released first still lets the original write win", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	test.setTimeout(120_000);
	await openRules(page, workspaceUser);
	await releaseDuplicate(page, accountId, "duplicate-first");
});

test("an original tab released first still lets the duplicate write win", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	test.setTimeout(120_000);
	await openRules(page, workspaceUser);
	await releaseDuplicate(page, accountId, "original-first");
});

test("storage off keeps a fresh id and retires nothing", async ({ page }) => {
	const bare = await page.context().newPage();
	try {
		await bare.addInitScript(() => {
			Object.defineProperty(window, "sessionStorage", {
				configurable: true,
				get() {
					throw new DOMException("Blocked", "SecurityError");
				},
			});
		});
		await bare.goto("/rules");
		const first = await bare.evaluate(async (specifier) => {
			const fence = await import(specifier);
			return [fence.nextWriteFence(), fence.nextWriteFence()];
		}, fenceModule);
		expect(first[0]?.retires).toEqual([]);
		expect(first[1]?.retires).toEqual([]);
		expect(first[0]?.tab).toBe(first[1]?.tab);
		expect(first[0]?.seq).toBe(1);
		expect(first[1]?.seq).toBe(2);
		await bare.reload();
		const second = await bare.evaluate(async (specifier) => {
			const fence = await import(specifier);
			return fence.nextWriteFence();
		}, fenceModule);
		expect(second.tab).not.toBe(first[0]?.tab);
		expect(second.seq).toBe(1);
		expect(second.retires).toEqual([]);
	} finally {
		await bare.close();
	}
});

async function fenceState(page: Page) {
	return page.evaluate(
		async ({ key, specifier }) => {
			const raw = sessionStorage.getItem(key);
			if (!raw) {
				throw new Error("The tab fence was not stored.");
			}
			const stored = JSON.parse(raw) as { current?: string; pending?: string[] };
			if (stored.current) {
				throw new Error("The live tab id is in sessionStorage.");
			}
			const fence = await import(specifier);
			const stamp = fence.nextWriteFence() as { tab: string; retires: string[] };
			return { current: stamp.tab as string, pending: stored.pending ?? [] };
		},
		{ key: fenceStorageKey, specifier: fenceModule },
	);
}

async function releaseDuplicate(page: Page, accountId: string, order: "duplicate-first" | "original-first") {
	const original = await fenceState(page);
	const stored = await page.evaluate((key) => sessionStorage.getItem(key), fenceStorageKey);
	if (!stored) {
		throw new Error("The tab fence was not stored.");
	}
	const parsed = JSON.parse(stored) as { current?: string; pending?: string[] };
	expect(parsed.current).toBeUndefined();
	expect(parsed.pending ?? []).not.toContain(original.current);
	const duplicate = await page.context().newPage();
	const held: Route[] = [];
	const watch = async (route: Route) => {
		const request = route.request();
		if (request.method() === "POST" && (request.postData() ?? "").includes(adCap)) {
			held.push(route);
			return;
		}
		await route.continue();
	};
	try {
		await duplicate.addInitScript(
			([key, value]) => {
				sessionStorage.setItem(key, value);
			},
			[fenceStorageKey, stored] as const,
		);
		await duplicate.route("**/*", watch);
		await duplicate.goto("/rules");
		await whenSliderReady(duplicate);
		const copy = await fenceState(duplicate);
		expect(copy.current).not.toBe(original.current);
		expect(copy.pending).not.toContain(original.current);
		await page.route("**/*", watch);
		await page.locator("#lim-ads").fill("260");
		await duplicate.locator("#lim-ads").fill("240");
		await expect.poll(() => held.length).toBe(2);
		const originalRoute = held.find((route) => postedField(route.request().postData() ?? "", "value") === 260);
		const duplicateRoute = held.find((route) => postedField(route.request().postData() ?? "", "value") === 240);
		if (!originalRoute || !duplicateRoute) {
			throw new Error("The duplicate writes were not held.");
		}
		const originalBody = originalRoute.request().postData() ?? "";
		const duplicateBody = duplicateRoute.request().postData() ?? "";
		expect(originalBody).not.toContain(copy.current);
		expect(duplicateBody).not.toContain(original.current);
		const first = order === "duplicate-first" ? duplicateRoute : originalRoute;
		const second = order === "duplicate-first" ? originalRoute : duplicateRoute;
		const firstValue = order === "duplicate-first" ? 240 : 260;
		const secondValue = order === "duplicate-first" ? 260 : 240;
		await settle(first);
		await expectStored(accountId, adCap, firstValue);
		await settle(second);
		await expectStored(accountId, adCap, secondValue);
	} finally {
		await page.unroute("**/*");
		await duplicate.close();
	}
}

test("a stored list longer than eight keeps the newest eight", async ({ page }) => {
	const ids = Array.from({ length: 9 }, (_, index) => `old-tab-${index}`);
	await page.addInitScript(
		([key, value]) => {
			sessionStorage.setItem(key, value);
		},
		[fenceStorageKey, JSON.stringify({ pending: ids })] as const,
	);
	await page.goto("/rules");
	const state = await page.evaluate(async (specifier) => {
		const fence = await import(specifier);
		const stamp = fence.nextWriteFence() as { retires: string[] };
		const stored = JSON.parse(sessionStorage.getItem("tensquads.writeFence") ?? "{}") as {
			pending?: string[];
			current?: string;
		};
		return { retires: stamp.retires, pending: stored.pending ?? [], current: stored.current };
	}, fenceModule);
	expect(state.retires).toEqual(ids.slice(1));
	expect(state.pending).toEqual(ids.slice(1));
	expect(state.current).toBeUndefined();
	expect(state.retires).not.toContain("old-tab-0");
});

test("pagehide records the live id and a restored page takes a fresh one", async ({ page }) => {
	await page.goto("/rules");
	const before = await page.evaluate(async (specifier) => {
		const fence = await import(specifier);
		const stamp = fence.nextWriteFence() as { tab: string };
		return { tab: stamp.tab, raw: sessionStorage.getItem("tensquads.writeFence") ?? "" };
	}, fenceModule);
	expect(before.raw).not.toContain(before.tab);
	await page.evaluate(() => {
		window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
	});
	const hidden = await page.evaluate((tab) => {
		const raw = sessionStorage.getItem("tensquads.writeFence") ?? "";
		return { has: raw.includes(tab), current: raw.includes('"current"') };
	}, before.tab);
	expect(hidden.has).toBe(true);
	expect(hidden.current).toBe(false);
	const after = await page.evaluate(async (specifier) => {
		window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
		const fence = await import(specifier);
		const stamp = fence.nextWriteFence() as { tab: string; retires: string[] };
		const stored = JSON.parse(sessionStorage.getItem("tensquads.writeFence") ?? "{}") as {
			current?: string;
			pending?: string[];
		};
		return { tab: stamp.tab, retires: stamp.retires, stored };
	}, fenceModule);
	expect(after.tab).not.toBe(before.tab);
	expect(after.retires).toContain(before.tab);
	expect(after.stored.current).toBeUndefined();
	expect(after.stored.pending ?? []).toContain(before.tab);
	expect(after.stored.pending ?? []).not.toContain(after.tab);
});

test("a cancelled navigation does not retire the live id", async ({ page }) => {
	await page.goto("/rules");
	const tab = await page.evaluate(async (specifier) => {
		const fence = await import(specifier);
		return (fence.nextWriteFence() as { tab: string }).tab;
	}, fenceModule);
	await page.evaluate(() => {
		window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
		window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
	});
	const after = await page.evaluate(async (specifier) => {
		const fence = await import(specifier);
		const stamp = fence.nextWriteFence() as { tab: string; retires: string[] };
		const stored = JSON.parse(sessionStorage.getItem("tensquads.writeFence") ?? "{}") as {
			pending?: string[];
			current?: string;
		};
		return { tab: stamp.tab, pending: stored.pending ?? [], current: stored.current, retires: stamp.retires };
	}, fenceModule);
	expect(after.tab).toBe(tab);
	expect(after.pending).not.toContain(tab);
	expect(after.retires).not.toContain(tab);
	expect(after.current).toBeUndefined();
});

async function whenSliderReady(page: Page) {
	await page.waitForFunction(() => {
		const slider = document.querySelector("#lim-ads");
		if (!slider) return false;
		const key = Object.keys(slider).find((name) => name.startsWith("__reactProps"));
		if (!key) return false;
		const props = (slider as unknown as Record<string, { onChange?: unknown }>)[key];
		return typeof props?.onChange === "function";
	});
}

async function openRules(page: Page, user: { email: string; password: string }) {
	await openWorkspace(page, user);
	await page.getByRole("button", { name: "Rules and limits", exact: true }).click();
	await expect(page).toHaveURL(/\/rules$/);
	await expect(page.getByRole("heading", { name: "Rules and limits", exact: true })).toBeVisible();
	await expect(page.locator("#lim-ads")).toHaveValue("200");
}

async function captureRulesUrl(page: Page, user: { email: string; password: string }) {
	let rulesUrl = "";
	page.on("response", async (response) => {
		if (rulesUrl.length > 0 || response.request().method() !== "GET" || !response.url().includes("/_serverFn/")) {
			return;
		}
		try {
			if ((await response.text()).includes(adCap)) {
				rulesUrl = response.url().split("?")[0] ?? "";
			}
		} catch {
			// A body that is already closed is not the rules payload.
		}
	});
	await openRules(page, user);
	await expect.poll(() => rulesUrl).not.toBe("");
	return rulesUrl;
}

async function holdPosts(page: Page, marker: string) {
	const held: Route[] = [];
	await page.route("**/*", async (route) => {
		const request = route.request();
		if (request.method() === "POST" && (request.postData() ?? "").includes(marker)) {
			held.push(route);
			return;
		}
		await route.continue();
	});
	return held;
}

function requestFor(held: Route[], value: string) {
	const wanted = Number(value);
	const route = held.find((item) => postedField(item.request().postData() ?? "", "value") === wanted);
	if (!route) {
		throw new Error(`The ${value} write was not held.`);
	}
	return route;
}

function switchOn(route: Route | undefined) {
	const value = postedField(route?.request().postData() ?? "", "on");
	if (value === true || value === false) return value;
	throw new Error("The held switch has no on value.");
}

async function settle(route: Route) {
	const response = await route.fetch();
	await route.fulfill({ response });
}

function mondaySwitch(page: Page) {
	return page.locator("[data-loop='rules'] > div").nth(4).getByRole("button", { name: "Rule enabled" });
}

async function clickRule(page: Page, on: boolean) {
	const marker = on ? '{"t":2,"s":2}' : '{"t":2,"s":3}';
	const written = page.waitForResponse((response) => {
		const request = response.request();
		const body = request.postData() ?? "";
		return request.method() === "POST" && body.includes("r5") && body.includes(marker);
	});
	await mondaySwitch(page).click();
	await written;
}

async function act(page: Page, kind: "lim-refund" | "lim-ads" | "lim-reorder" | "rule" | "add") {
	if (kind === "rule") {
		await mondaySwitch(page).click();
		return;
	}
	if (kind === "add") {
		await page.getByLabel("Then", { exact: true }).fill("Recovery rule");
		await page.getByRole("button", { name: "Add rule", exact: true }).click();
		return;
	}
	const value = kind === "lim-refund" ? "70" : kind === "lim-ads" ? "240" : "600";
	await page.locator(`#${kind}`).fill(value);
}

async function restored(page: Page, kind: "lim-refund" | "lim-ads" | "lim-reorder" | "rule" | "add") {
	if (kind === "rule") {
		await expect(mondaySwitch(page)).toHaveAttribute("aria-pressed", "false");
		return;
	}
	if (kind === "add") {
		await expect(page.getByLabel("Then", { exact: true })).toHaveValue("Recovery rule");
		await expect(page.getByText("then Recovery rule", { exact: true })).toHaveCount(0);
		return;
	}
	const value = kind === "lim-refund" ? "50" : kind === "lim-ads" ? "200" : "500";
	await expect(page.locator(`#${kind}`)).toHaveValue(value);
}

async function ended(page: Page, kind: "lim-refund" | "lim-ads" | "lim-reorder" | "rule" | "add") {
	if (kind === "rule") {
		await expect(mondaySwitch(page)).toHaveAttribute("aria-pressed", "true");
		return;
	}
	if (kind === "add") {
		await expect(page.getByText("then Recovery rule", { exact: true })).toBeVisible();
		const row = page.locator("[data-loop='rules'] > div").filter({ hasText: "Recovery rule" });
		await expect(row.getByRole("button", { name: "Rule enabled" })).toHaveAttribute("aria-pressed", "true");
		return;
	}
	const value = kind === "lim-refund" ? "70" : kind === "lim-ads" ? "240" : "600";
	await expect(page.locator(`#${kind}`)).toHaveValue(value);
}

async function failFirstPostAndRead(page: Page, rulesUrl: string) {
	const gate = { postFailed: false, readFailed: false, reads: 0, writesSeen: 0 };
	await page.route("**/*", async (route) => {
		const request = route.request();
		const body = request.postData() ?? "";
		const rulesPost =
			body.includes("policy.") || body.includes("r5") || body.includes("Recovery rule") || body.includes('"on"');
		if (request.method() === "POST" && request.url().includes("/_serverFn/") && rulesPost) {
			gate.writesSeen += 1;
			if (!gate.postFailed) {
				gate.postFailed = true;
				await route.fulfill({ status: 500, contentType: "text/plain", body: "POST failed" });
				return;
			}
		}
		if (request.method() === "GET" && (request.url().split("?")[0] ?? "") === rulesUrl) {
			gate.reads += 1;
			if (!gate.readFailed) {
				gate.readFailed = true;
				await route.fulfill({ status: 500, contentType: "text/plain", body: "GET failed" });
				return;
			}
		}
		await route.continue();
	});
	return gate;
}

async function recoveryGeneration(page: Page) {
	return page.evaluate(async (specifier) => {
		const queue = await import(specifier);
		return queue.rulesRecoveryGeneration();
	}, rulesQueueModule);
}

function delay(ms: number) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

async function writeCounter(page: Page) {
	return page.evaluate(async (specifier) => {
		const queue = await import(specifier);
		return queue.rulesWriteCounter();
	}, rulesQueueModule);
}

async function expectStored(accountId: string, key: string, value: number) {
	await expect.poll(() => storedLimit(accountId, key)).toBe(value);
}

async function storedLimit(accountId: string, key: string) {
	const postgres = openPostgres(secretsFor(["testDatabase"]).testDatabase);
	try {
		const rows = await postgres.db
			.select()
			.from(schema.stateEntries)
			.where(eq(schema.stateEntries.accountId, accountId));
		const row = rows.find((item) => item.key === key);
		return row ? (JSON.parse(row.value) as unknown) : undefined;
	} finally {
		await postgres.close();
	}
}

async function expectRuleOn(accountId: string, on: boolean) {
	await expect.poll(() => ruleOn(accountId)).toBe(on);
}

async function ruleOn(accountId: string) {
	const postgres = openPostgres(secretsFor(["testDatabase"]).testDatabase);
	try {
		const rows = await postgres.db.select().from(schema.rules).where(eq(schema.rules.accountId, accountId));
		return rows.find((item) => item.ruleWhen === monday)?.isOn;
	} finally {
		await postgres.close();
	}
}

async function ruleCount(accountId: string) {
	const postgres = openPostgres(secretsFor(["testDatabase"]).testDatabase);
	try {
		const rows = await postgres.db.select().from(schema.rules).where(eq(schema.rules.accountId, accountId));
		return rows.length;
	} finally {
		await postgres.close();
	}
}
