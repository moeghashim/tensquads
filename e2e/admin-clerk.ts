import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import { clerkPostId, createClerkUser } from "./clerk-user.ts";

export const companyOrgId = "org_3Lazia1HC1hdgfY0mAttb1qTWYm";

const companyUserId = "user_3Lazhi4zDFFw28I6hhujdsQrV4W";
const companyEmail = "moe@10claws.com";

export interface ClerkTestUser {
	readonly email: string;
	readonly password: string;
	readonly userId: string;
}

function guardUser(userId: string, email = "") {
	if (userId === companyUserId || email.toLowerCase() === companyEmail) {
		throw new Error("Refusing to change the company super admin.");
	}
}

function guardOrg(orgId: string) {
	if (orgId === companyOrgId) {
		throw new Error("Refusing to change the company organization.");
	}
}

async function clerk(secret: string, path: string, method: string, body?: unknown) {
	const response = await fetch(`https://api.clerk.com/v1${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${secret}`,
			"Content-Type": "application/json",
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (!response.ok && response.status !== 404) {
		throw new Error(`Clerk ${method} ${path} failed with status ${response.status}.`);
	}
	return response;
}

export async function createTestUser(
	secret: string,
	name?: { readonly firstName: string; readonly lastName: string },
): Promise<ClerkTestUser> {
	const email = `sq-${randomUUID().slice(0, 8)}@example.com`;
	guardUser("pending", email);
	const password = `Ts${randomUUID().replaceAll("-", "")}Zq7`;
	const userId = await createClerkUser(secret, email, password, name);
	guardUser(userId, email);
	return { email, password, userId };
}

export async function deleteTestUser(secret: string, userId: string) {
	if (userId.length === 0) return;
	guardUser(userId);
	await clerk(secret, `/users/${userId}`, "DELETE");
}

export async function addCompanySuperAdmin(secret: string, userId: string) {
	guardUser(userId);
	const response = await fetch(`https://api.clerk.com/v1/organizations/${companyOrgId}/memberships`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${secret}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ user_id: userId, role: "org:super_admin" }),
	});
	if (!response.ok) {
		throw new Error(`Clerk membership failed with status ${response.status}.`);
	}
}

export async function removeCompanyMembership(secret: string, userId: string) {
	guardUser(userId);
	await clerk(secret, `/organizations/${companyOrgId}/memberships/${userId}`, "DELETE");
}

export async function setCompanyRole(secret: string, userId: string, role: "org:member" | "org:super_admin") {
	guardUser(userId);
	const response = await clerk(secret, `/organizations/${companyOrgId}/memberships/${userId}`, "PATCH", { role });
	if (!response.ok) {
		throw new Error(`Clerk membership role failed with status ${response.status}.`);
	}
}

export async function createForeignOrg(secret: string, userId: string) {
	guardUser(userId);
	const orgId = await clerkPostId(
		secret,
		"/organizations",
		{ name: `foreign-${randomUUID().slice(0, 8)}`, created_by: userId },
		"Clerk create organization failed with status",
		"Clerk create organization returned no id.",
	);
	guardOrg(orgId);
	const patched = await fetch(`https://api.clerk.com/v1/organizations/${orgId}/memberships/${userId}`, {
		method: "PATCH",
		headers: {
			Authorization: `Bearer ${secret}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ role: "org:super_admin" }),
	});
	if (!patched.ok) {
		throw new Error(`Clerk membership role failed with status ${patched.status}.`);
	}
	return orgId;
}

export async function deleteForeignOrg(secret: string, orgId: string) {
	if (orgId.length === 0) return;
	guardOrg(orgId);
	await clerk(secret, `/organizations/${orgId}`, "DELETE");
}

export async function signInAs(page: Page, user: ClerkTestUser) {
	await page.goto("/signin");
	await page.getByLabel("Email").fill(user.email);
	await page.getByLabel("Password").fill(user.password);
	await page.getByRole("button", { name: "Sign in" }).click();
}

export async function activateForeignOrg(page: Page, orgId: string) {
	await page.waitForFunction(() => {
		const clerk = (window as unknown as { Clerk?: { loaded?: boolean } }).Clerk;
		return clerk?.loaded === true;
	});
	await page.evaluate(async (id) => {
		const clerk = (window as unknown as { Clerk: { setActive: (params: { organization: string }) => Promise<void> } })
			.Clerk;
		await clerk.setActive({ organization: id });
	}, orgId);
}
