import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { openPostgres } from "@tensquads/adapters";
import { createClerkUser } from "./clerk-user.ts";
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
	const createNotes = watchCreateAccount(page);
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
			await Promise.all(createNotes.pending);
			const detail = [...authNotes, ...notes, ...createNotes.notes].join(" | ");
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
		const accountId = firstId(rows);
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

function watchCreateAccount(page: import("@playwright/test").Page) {
	const notes: string[] = [];
	const pending: Promise<void>[] = [];
	page.on("response", (response) => {
		const path = createAccountPath(response);
		if (!path) return;
		pending.push(readCreateNote(response, path, notes));
	});
	return { notes, pending };
}

function createAccountPath(response: import("@playwright/test").Response): string | null {
	if (response.request().method() !== "POST") return null;
	const path = localhostPath(response.url());
	if (!path || assetPath(path)) return null;
	return path;
}

function localhostPath(value: string): string | null {
	try {
		const url = new URL(value);
		if (!url.hostname.includes("localhost")) return null;
		return url.pathname;
	} catch {
		return null;
	}
}

function assetPath(path: string): boolean {
	return path.startsWith("/v1/") || path.startsWith("/@") || path.startsWith("/src");
}

function readCreateNote(response: import("@playwright/test").Response, path: string, notes: string[]): Promise<void> {
	return response
		.text()
		.then((text) => {
			notes.push(createAccountNote(response.status(), path, text));
		})
		.catch(() => undefined);
}

function createAccountNote(status: number, path: string, text: string): string {
	const message = createAccountMessage(text)
		.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]")
		.replace(/[\w.+-]+@[\w.-]+/g, "[email]")
		.replace(/sk_(?:test|live)_[A-Za-z0-9]+/g, "[redacted]")
		.replace(/pk_(?:test|live)_[A-Za-z0-9]+/g, "[redacted]")
		.slice(0, 180);
	return `${status} ${path} ${message}`.trim();
}

const createFailures: readonly (readonly [string, string])[] = [
	["The session needs a refresh.", "session refresh"],
	["The workspace write did not finish.", "unfinished"],
	["The database is not configured.", "database not configured"],
	["The create request is not valid.", "invalid create request"],
];

function createAccountMessage(text: string): string {
	const known = knownCreateFailure(text);
	if (known) return known;
	return createAccountSentence(text);
}

function knownCreateFailure(text: string): string | null {
	if (text.toLowerCase().includes("deadlock") || text.includes("40P01")) return "deadlock 40P01";
	return labeledFailure(text);
}

function labeledFailure(text: string): string | null {
	for (const [needle, label] of createFailures) {
		if (text.includes(needle)) return label;
	}
	return null;
}

function createAccountSentence(text: string): string {
	const sentence = text.match(/The [^"\\]{0,120}/);
	if (sentence) return sentence[0];
	if (text.includes("created")) return "ok";
	return "no-error-message";
}

function firstId(rows: readonly { id?: unknown }[]): string {
	const row = rows[0];
	if (!row) return "";
	if (row.id === undefined || row.id === null) return "";
	return String(row.id);
}

type Sql = ReturnType<typeof neon>;

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
