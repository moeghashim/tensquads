import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { createRepositories, openPostgres } from "@tensquads/adapters";

import {
	activateForeignOrg,
	addCompanySuperAdmin,
	type ClerkTestUser,
	companyOrgId,
	createForeignOrg,
	createTestUser,
	deleteForeignOrg,
	deleteTestUser,
	removeCompanyMembership,
	signInAs,
} from "./admin-clerk.ts";
import { expect, openAdmin, test } from "./admin-db.ts";
import { secretsFor } from "./support.ts";
import { deleteWorkspaceAccount } from "./workspace.ts";

test("a visitor with no session goes to sign in", async ({ page }) => {
	await page.goto("/admin");
	await expect(page).toHaveURL(/\/signin$/);
	await expect(page).toHaveTitle("Sign in");
	await page.goto("/admin/images");
	await expect(page).toHaveURL(/\/signin$/);
});

test("a role in another organization cannot reach admin", async ({ page }) => {
	const secrets = secretsFor(["secret"]);
	const user = await createTestUser(secrets.secret);
	let orgId = "";
	try {
		orgId = await createForeignOrg(secrets.secret, user.userId);
		expect(orgId).not.toBe(companyOrgId);
		await signInAs(page, user);
		await expect(page).toHaveURL(/\/signup$/, { timeout: 20_000 });
		await activateForeignOrg(page, orgId);
		await page.goto("/admin");
		await expect(page).toHaveURL(/\/signup$/);
		await expect(page.getByText("Platform admin")).toHaveCount(0);
		await expect(page).not.toHaveURL(/\/admin/);
	} finally {
		if (orgId.length > 0) await deleteForeignOrg(secrets.secret, orgId);
		await deleteTestUser(secrets.secret, user.userId);
	}
});

test("an account owner cannot reach admin or the admin server functions", async ({ page }) => {
	const secrets = secretsFor(["secret", "testDatabase"]);
	const user = await createTestUser(secrets.secret);
	const accountId = `owner-${randomUUID().slice(0, 8)}`;
	try {
		await createOwner(secrets.testDatabase, accountId, user);
		await signInAs(page, user);
		await expect(page).toHaveURL(/\/overview$/, { timeout: 20_000 });
		await expect(page.getByText("Runs 1 squads · Owner Fixture")).toBeVisible();
		await expect(page.getByRole("button", { name: "All companies" })).toHaveCount(0);
		await page.goto("/admin");
		await expect(page).toHaveURL(/\/overview$/);
		await expect(page.getByText("Platform admin")).toHaveCount(0);
		await page.goto("/admin/images");
		await expect(page).toHaveURL(/\/overview$/);
		const blocked = await callAdmin(page);
		expect(blocked.reached).toBe(false);
		await page.context().addCookies([
			{
				name: "ts_special_account",
				value: "northwind",
				url: "http://localhost:3000",
				httpOnly: true,
				secure: true,
				sameSite: "Lax",
			},
		]);
		await page.goto("/overview");
		await expect(page.getByText("Runs 1 squads · Owner Fixture")).toBeVisible();
		await expect(page.getByText("Northwind Apparel")).toHaveCount(0);
		await expect(page.getByText("Tom Becker")).toHaveCount(0);
	} finally {
		await deleteWorkspaceAccount(accountId);
		await deleteTestUser(secrets.secret, user.userId);
	}
});

test("a super admin opens one account and All companies ends that session", async ({ page }) => {
	const secrets = secretsFor(["secret"]);
	const user = await createTestUser(secrets.secret, { firstName: "Moe", lastName: "Ghashim" });
	try {
		await addCompanySuperAdmin(secrets.secret, user.userId);
		await openAdmin(page, user);
		await page.getByRole("button", { name: "Demo store" }).click();
		await expect(page).toHaveURL(/\/overview$/);
		await expect(page.getByText("Runs 5 squads · Demo store")).toBeVisible();
		await page.getByRole("button", { name: "Chat with the master" }).click();
		await expect(page.getByText("Did the tracking for #A-1007 go through?")).toBeVisible();
		await page.getByRole("button", { name: "All companies" }).click();
		await expect(page).toHaveURL(/\/admin\/?$/);
		await expect(page.getByRole("navigation", { name: "Platform admin" })).toBeVisible();
		const cookies = await page.context().cookies("http://localhost:3000");
		expect(cookies.some((cookie) => cookie.name === "ts_special_account")).toBe(false);
		await page.goto("/overview");
		await expect(page).toHaveURL(/\/admin\/?$/);
		await page.getByRole("button", { name: "Northwind Apparel" }).click();
		await expect(page).toHaveURL(/\/overview$/);
		await expect(page.getByText("Runs 14 squads · Northwind Apparel")).toBeVisible();
		await expect(page.getByText("Tom Becker")).toBeVisible();
		await expect(page.getByText("Demo store")).toHaveCount(0);
		await expect(page.getByText("Did the tracking for #A-1007 go through?")).toHaveCount(0);
	} finally {
		await removeCompanyMembership(secrets.secret, user.userId);
		await deleteTestUser(secrets.secret, user.userId);
	}
});

async function createOwner(databaseUrl: string, accountId: string, user: ClerkTestUser) {
	const postgres = openPostgres(databaseUrl);
	try {
		await postgres.migrate();
		await createRepositories(postgres.db).platform.createWorkspace(
			{ accountId, mode: "account" },
			{
				clerkUserId: user.userId,
				email: user.email,
				name: "Owner Fixture",
				mission: "Sell one product well",
				agents: [{ id: "orders", name: "Orders", role: "Fulfilment and tracking", tint: "#e7efff" }],
			},
		);
	} finally {
		await postgres.close();
	}
}

async function callAdmin(page: Page) {
	return page.evaluate(async () => {
		try {
			const mod = (await import("/src/server/admin.ts")) as {
				loadAdminAccounts: () => Promise<unknown>;
			};
			const accounts = await mod.loadAdminAccounts();
			const names = Array.isArray(accounts)
				? accounts.map((account) => (account as { name?: string }).name ?? "")
				: [];
			return { reached: names.includes("Northwind Apparel"), names };
		} catch {
			return { reached: false, names: [] as string[] };
		}
	});
}
