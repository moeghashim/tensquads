import type { Page } from "@playwright/test";
import { openPostgres, saveWorkspace } from "@tensquads/adapters";

import { workspaceFromDesign } from "../packages/seed/src/workspace.ts";
import { type ClerkTestUser, signInAs } from "./admin-clerk.ts";
import { test as base, expect, secretsFor } from "./support.ts";

export const test = base.extend({
	reseed: [
		// biome-ignore lint/correctness/noEmptyPattern: Playwright requires the empty fixture pattern.
		async ({}, use) => {
			await reseedAdminDatabase();
			await use();
		},
		{ auto: true },
	],
});

export { expect };

export async function reseedAdminDatabase() {
	const secrets = secretsFor(["testDatabase"]);
	const postgres = openPostgres(secrets.testDatabase);
	try {
		await postgres.migrate();
		await saveWorkspace(postgres.db, workspaceFromDesign());
	} finally {
		await postgres.close();
	}
}

export async function openAdmin(page: Page, user: ClerkTestUser) {
	await signInAs(page, user);
	try {
		await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 20_000 });
	} catch (error) {
		const alert = (await page.getByRole("alert").allTextContents()).join(" ").trim();
		throw new Error(`Sign-in stayed on ${page.url()}. Alert: ${alert || "none"}. ${String(error)}`);
	}
	await expect(page.getByRole("navigation", { name: "Platform admin" })).toBeVisible();
	await expect(page.getByRole("navigation", { name: "Platform admin" }).getByText("Moe Ghashim")).toBeVisible();
}
