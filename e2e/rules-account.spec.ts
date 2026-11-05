import { randomUUID } from "node:crypto";

import type { Page, Route } from "@playwright/test";
import { openPostgres, schema } from "@tensquads/adapters";
import { eq } from "drizzle-orm";
import { replaceDemoAccount } from "../packages/seed/src/demo-account.ts";

import { createClerkUser } from "./clerk-user.ts";
import { secretsFor } from "./support.ts";
import { deleteWorkspaceAccount, expect, openWorkspace, test } from "./workspace.ts";

const adCap = "policy.daily_ad_cap";
const rulesQueueModule = "/src/screens/rules/write-queue.ts";
const rulesLoaderModule = "/src/screens/rules/loader.ts";

test("a real Clerk sign-out keeps the next account clear of a held write and a held read", async ({
	page,
	workspaceUser,
	accountId,
}) => {
	test.setTimeout(90_000);
	const secrets = secretsFor(["secret", "testDatabase"]);
	const email = `sq-${randomUUID().slice(0, 8)}@example.com`;
	const password = `Ts${randomUUID().replaceAll("-", "")}Zq7`;
	const otherAccount = `rules-b-${randomUUID().slice(0, 8)}`;
	let userId = "";
	try {
		userId = await createClerkUser(secrets.secret, email, password);
		const postgres = openPostgres(secrets.testDatabase);
		try {
			await replaceDemoAccount(postgres.db, otherAccount, userId);
		} finally {
			await postgres.close();
		}
		const rulesUrl = await captureRulesUrl(page);
		await openWorkspace(page, workspaceUser);
		await page.evaluate(() => {
			(window as Window & { __rulesDocument?: string }).__rulesDocument = "same";
		});
		await page.getByRole("button", { name: "Rules and limits", exact: true }).click();
		await expect(page).toHaveURL(/\/rules$/);
		await expect(page.locator("#lim-ads")).toHaveValue("200");
		await expect.poll(() => rulesUrl.current).not.toBe("");
		await page.clock.install();
		const parked = await parkReadAndLaterWrite(page, rulesUrl);
		const started = await page.evaluate(
			async (specifiers) => {
				const queue = await import(specifiers.queue);
				const loader = await import(specifiers.loader);
				const counter = queue.rulesWriteCounter();
				(window as Window & { __staleRead?: Promise<unknown> }).__staleRead = loader.loadRulesSnapshot();
				return counter;
			},
			{ queue: rulesQueueModule, loader: rulesLoaderModule },
		);
		expect(started).toBe(0);
		await expect.poll(() => parked.reads()).toBe(1);
		// The default poll is 5s. The write response itself often takes longer, so wait for it first.
		const written = page.waitForResponse((response) => {
			const request = response.request();
			if (request.method() !== "POST") return false;
			const post = request.postData() ?? "";
			return post.includes(adCap) && post.includes("240");
		});
		await page.locator("#lim-ads").fill("240");
		const writeResponse = await written;
		const writeBody = await writeResponse.text();
		expect(writeResponse.ok()).toBe(true);
		// A serialized error is still HTTP 200. Only a written 240 is the commit.
		expect(writeBody.includes("written")).toBe(true);
		expect(writeBody.includes("240")).toBe(true);
		await expectStored(accountId, 240);
		await expect(page.locator("#lim-ads")).toHaveValue("240");
		parked.holdWrites = true;
		await page.locator("#lim-ads").fill("260");
		await expect(page.locator("#lim-ads")).toHaveValue("260");
		await expect.poll(() => parked.writes()).toBe(1);
		await page.clock.resume();
		let documentLoads = 0;
		page.on("load", () => {
			documentLoads += 1;
		});
		await page.evaluate(async () => {
			const clerk = (window as unknown as { Clerk?: { signOut: () => Promise<unknown> } }).Clerk;
			if (!clerk) {
				throw new Error("Clerk is missing.");
			}
			await clerk.signOut();
		});
		await page.unroute("**/*", parked.handler);
		expect(documentLoads).toBe(0);
		if (!page.url().includes("/signin")) {
			await page.evaluate(async () => {
				const router = (
					window as unknown as {
						__TSR_ROUTER__?: { navigate: (options: { to: string }) => Promise<unknown> };
					}
				).__TSR_ROUTER__;
				if (!router) {
					throw new Error("The page router is missing.");
				}
				await router.navigate({ to: "/signin" });
			});
		}
		expect(documentLoads).toBe(0);
		await expect(page).toHaveURL(/\/signin$/);
		await expect(page.getByLabel("Email")).toBeVisible();
		expect(await documentMark(page)).toBe("same");
		await page.getByLabel("Email").fill(email);
		await page.getByLabel("Password").fill(password);
		await page.getByRole("button", { name: "Sign in" }).click();
		await expect(page).toHaveURL(/\/overview$/, { timeout: 20_000 });
		await page.getByRole("button", { name: "Rules and limits", exact: true }).click();
		await expect(page).toHaveURL(/\/rules$/);
		await expect(page.locator("#lim-ads")).toHaveValue("200");
		expect(await writeCounter(page)).toBe(0);
		await settle(parked.write());
		await settle(parked.read());
		const stale = await page.evaluate(async () => {
			const pending = (window as Window & { __staleRead?: Promise<{ limits: { key: string; value: number }[] }> })
				.__staleRead;
			if (!pending) {
				return { ok: false, cap: -1 };
			}
			try {
				const body = await pending;
				const cap = body.limits.find((row) => row.key === "policy.daily_ad_cap")?.value ?? -1;
				return { ok: true, cap };
			} catch {
				return { ok: false, cap: -1 };
			}
		});
		expect(stale.cap).not.toBe(240);
		expect(stale.cap).not.toBe(260);
		await expect(page.locator("#lim-ads")).toHaveValue("200");
		expect(await writeCounter(page)).toBe(0);
		expect(await documentMark(page)).toBe("same");
		await expectStored(accountId, 260);
		await expectStored(otherAccount, 200);
	} finally {
		if (userId.length > 0) {
			await deleteWorkspaceAccount(otherAccount);
			await deleteClerkUser(secrets.secret, userId);
		}
	}
});

async function captureRulesUrl(page: Page) {
	const rulesUrl = { current: "" };
	page.on("response", async (response) => {
		if (rulesUrl.current.length > 0 || response.request().method() !== "GET") {
			return;
		}
		if (!response.url().includes("/_serverFn/")) {
			return;
		}
		try {
			if ((await response.text()).includes(adCap)) {
				rulesUrl.current = response.url().split("?")[0] ?? "";
			}
		} catch {
			// A body that is already closed is not the rules payload.
		}
	});
	return rulesUrl;
}

async function parkReadAndLaterWrite(page: Page, rulesUrl: { current: string }) {
	const parked: { route: Route; kind: "read" | "write" }[] = [];
	const state = { holdWrites: false };
	const handler = async (route: Route) => {
		const request = route.request();
		const url = request.url().split("?")[0] ?? "";
		if (request.method() === "GET" && url === rulesUrl.current && !parked.some((item) => item.kind === "read")) {
			parked.push({ route, kind: "read" });
			return;
		}
		if (state.holdWrites && request.method() === "POST" && (request.postData() ?? "").includes(adCap)) {
			parked.push({ route, kind: "write" });
			return;
		}
		await route.continue();
	};
	await page.route("**/*", handler);
	return {
		handler,
		get holdWrites() {
			return state.holdWrites;
		},
		set holdWrites(value: boolean) {
			state.holdWrites = value;
		},
		reads: () => parked.filter((item) => item.kind === "read").length,
		writes: () => parked.filter((item) => item.kind === "write").length,
		read: () => parked.find((item) => item.kind === "read")?.route as Route,
		write: () => parked.find((item) => item.kind === "write")?.route as Route,
	};
}

async function settle(route: Route) {
	const response = await route.fetch();
	await route.fulfill({ response });
}

async function documentMark(page: Page) {
	return page.evaluate(() => (window as Window & { __rulesDocument?: string }).__rulesDocument ?? "");
}

async function writeCounter(page: Page) {
	return page.evaluate(async (specifier) => {
		const queue = await import(specifier);
		return queue.rulesWriteCounter();
	}, rulesQueueModule);
}

async function expectStored(accountId: string, value: number) {
	await expect.poll(() => storedLimit(accountId)).toBe(value);
}

async function storedLimit(accountId: string) {
	const postgres = openPostgres(secretsFor(["testDatabase"]).testDatabase);
	try {
		const rows = await postgres.db
			.select()
			.from(schema.stateEntries)
			.where(eq(schema.stateEntries.accountId, accountId));
		const row = rows.find((item) => item.key === adCap);
		return row ? (JSON.parse(row.value) as unknown) : undefined;
	} finally {
		await postgres.close();
	}
}

async function deleteClerkUser(secret: string, userId: string) {
	if (userId.length === 0) {
		return;
	}
	const response = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
		method: "DELETE",
		headers: { Authorization: `Bearer ${secret}` },
	});
	if (!response.ok && response.status !== 404) {
		throw new Error(`Clerk delete user failed with status ${response.status}.`);
	}
}
