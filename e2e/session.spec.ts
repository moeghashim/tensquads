import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { openPostgres } from "@tensquads/adapters";
import { allowTestSignUp, expect, recordAuthNotes, secretsFor, test, watchPageErrors } from "./support.ts";
import { deleteWorkspaceAccount } from "./workspace.ts";

test("a visitor with no session is sent to sign-in", async ({ page }) => {
	for (const path of ["/overview", "/chat", "/agents", "/agents/support", "/traffic", "/rules"]) {
		await page.goto(path);
		await expect(page).toHaveURL(/\/signin$/);
	}
});

test("a sign-in with no account opens sign-up", async ({ page }) => {
	const secrets = secretsFor(["publishable", "secret", "testDatabase"]);
	const email = `sq-${randomUUID().slice(0, 8)}@example.com`;
	const password = `Ts${randomUUID().replaceAll("-", "")}Zq7`;
	const userId = await createClerkUser(secrets.secret, email, password);
	const postgres = openPostgres(secrets.testDatabase);
	try {
		await postgres.migrate();
	} finally {
		await postgres.close();
	}
	const authNotes = await recordAuthNotes(page);
	const notes = watchPageErrors(page);
	try {
		await page.goto("/signin");
		await page.getByLabel("Email").fill(email);
		await page.getByLabel("Password").fill(password);
		await page.getByRole("button", { name: "Sign in" }).click();
		try {
			await expect(page).toHaveURL(/\/signup$/, { timeout: 20_000 });
		} catch {
			const alert = (await page.getByRole("alert").allTextContents()).join(" ").trim();
			const detail = [...authNotes, ...notes].join(" | ");
			throw new Error(`Sign-in stayed on ${page.url()}. Alert: ${alert || "none"}. Notes: ${detail || "none"}.`);
		}
		await expect(page).toHaveTitle("Create your business");
	} finally {
		await deleteClerkUser(secrets.secret, userId);
	}
});

test("a new user makes one account and reaches overview", async ({ page }) => {
	const secrets = secretsFor(["publishable", "secret", "testDatabase"]);
	const email = `sq-${randomUUID().slice(0, 8)}@example.com`;
	const password = `Ts${randomUUID().replaceAll("-", "")}Zq7`;
	const sql = neon(secrets.testDatabase);
	const postgres = openPostgres(secrets.testDatabase);
	try {
		await postgres.migrate();
	} finally {
		await postgres.close();
	}
	const notes = watchPageErrors(page);
	const authNotes = await recordAuthNotes(page);
	await allowTestSignUp(page, secrets.publishable, secrets.secret);
	let userId = "";
	try {
		await page.goto("/signup");
		await page.getByRole("button", { name: /A new business/ }).click();
		await page.getByLabel("Business name").fill("Harbor Test");
		await page.getByLabel("Company mission").fill("Reach 500 paying customers in year one");
		await page.getByRole("button", { name: "Choose my squads" }).click();
		await page.getByRole("button", { name: "Create my workspace" }).click();
		await page.getByLabel("Email").fill(email);
		await page.getByLabel("Password").fill(password);
		await page.getByRole("button", { name: "Create my workspace" }).click();
		try {
			await page.waitForURL("**/overview", { timeout: 20_000 });
		} catch {
			const alert = (await page.getByRole("alert").allTextContents()).join(" ").trim();
			const detail = [...authNotes, ...notes].join(" | ");
			throw new Error(
				`Sign-up stayed on ${page.url()}. Alert: ${alert.length > 0 ? alert : "none"}. Notes: ${detail || "none"}.`,
			);
		}
		await expect(page).toHaveTitle("tensquads workspace");
		await expect(page.getByRole("heading", { name: /Good morning,/ })).toBeVisible();
		await expect(page.getByText("Runs 3 squads · Harbor Test")).toBeVisible();
		await expect(page.getByText("SQ", { exact: true })).toBeVisible();
		await expect(page.locator("[data-if='dockUnread']")).toHaveCount(0);
		const rows = await sql.query("select id from accounts where email = $1", [email]);
		expect(rows).toHaveLength(1);
		const accountId = String(rows[0]?.id ?? "");
		const agents = await sql.query("select id from agents where account_id = $1", [accountId]);
		expect(agents.length).toBeGreaterThan(0);
		userId = await clerkUserId(secrets.secret, email);
		const again = await sql.query("select id from accounts where clerk_user_id = $1", [userId]);
		expect(again).toHaveLength(1);
	} finally {
		if (userId.length === 0) {
			userId = await clerkUserId(secrets.secret, email).catch(() => "");
		}
		if (userId.length > 0) {
			await deleteAccountRows(sql, userId);
			await deleteClerkUser(secrets.secret, userId);
		}
	}
});

type Sql = ReturnType<typeof neon>;

async function createClerkUser(secret: string, email: string, password: string) {
	const response = await fetch("https://api.clerk.com/v1/users", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${secret}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			email_address: [email],
			password,
			skip_password_checks: true,
		}),
	});
	if (!response.ok) {
		throw new Error(`Clerk create user failed with status ${response.status}.`);
	}
	const body = (await response.json()) as { id?: string };
	if (!body.id) {
		throw new Error("Clerk create user returned no id.");
	}
	return body.id;
}

async function clerkUserId(secret: string, email: string) {
	const response = await fetch(`https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`, {
		headers: { Authorization: `Bearer ${secret}` },
	});
	if (!response.ok) {
		throw new Error(`Clerk user lookup failed with status ${response.status}.`);
	}
	const body = (await response.json()) as { id?: string }[];
	return body[0]?.id ?? "";
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

async function deleteAccountRows(sql: Sql, clerkUserId: string) {
	const rows = await sql.query("select id from accounts where clerk_user_id = $1", [clerkUserId]);
	for (const row of rows) {
		const id = String(row.id ?? "");
		if (id.length === 0) {
			continue;
		}
		await deleteWorkspaceAccount(id);
	}
}
