import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import type { Page } from "@playwright/test";
import { openPostgres, schema } from "@tensquads/adapters";
import { eq } from "drizzle-orm";
import { replaceDemoAccount } from "../packages/seed/src/demo-account.ts";
import { designInventory } from "../scripts/design-inventory.mjs";
import { test as base, expect, recordAuthNotes, secretsFor, watchPageErrors } from "./support.ts";

const fontStylesheetUrl =
	"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";
const fontStylesheet = readFileSync(new URL("./fonts/google-fonts.css", import.meta.url), "utf8");
const fontFiles = new Map(
	[...fontStylesheet.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(([, url]) => [
		url,
		readFileSync(new URL(`./fonts/${new URL(url).pathname.split("/").at(-1)}`, import.meta.url)),
	]),
);

const childTables = [
	"messages",
	"threads",
	"skills",
	"machines",
	"agents",
	"squads",
	"masters",
	"rules",
	"approvals",
	"mission_proposals",
	"bus_events",
	"state_entries",
	"daily_revenue",
	"overview_tiles",
	"subscriptions",
	"bus_cursors",
] as const;

export interface WorkspaceUser {
	readonly email: string;
	readonly password: string;
	readonly userId: string;
	readonly accountId: string;
}

export const test = base.extend<{ accountId: string }, { workspaceUser: WorkspaceUser }>({
	workspaceUser: [
		// Playwright reads this pattern. An empty pattern means the worker fixture has no fixture dependency.
		// biome-ignore lint/correctness/noEmptyPattern: Playwright requires the empty fixture pattern.
		async ({}, use, workerInfo) => {
			const secrets = secretsFor(["publishable", "secret", "testDatabase"]);
			const email = `sq-${randomUUID().slice(0, 8)}@example.com`;
			const password = `Ts${randomUUID().replaceAll("-", "")}Zq7`;
			const userId = await createClerkUser(secrets.secret, email, password);
			const accountId = `frame-${workerInfo.workerIndex}-${randomUUID().slice(0, 8)}`;
			const postgres = openPostgres(secrets.testDatabase);
			try {
				await postgres.migrate();
				await replaceDemoAccount(postgres.db, accountId, userId);
			} finally {
				await postgres.close();
			}
			await use({ email, password, userId, accountId });
			const sql = neon(secrets.testDatabase);
			await deleteAccount(sql, accountId);
			await deleteClerkUser(secrets.secret, userId);
		},
		{ scope: "worker" },
	],
	accountId: async ({ workspaceUser }, use) => {
		const secrets = secretsFor(["testDatabase"]);
		const postgres = openPostgres(secrets.testDatabase);
		try {
			await replaceDemoAccount(postgres.db, workspaceUser.accountId, workspaceUser.userId);
		} finally {
			await postgres.close();
		}
		await use(workspaceUser.accountId);
	},
});

export { expect };

export async function installLocalFonts(page: Page) {
	await page.route(fontStylesheetUrl, (route) => route.fulfill({ contentType: "text/css", body: fontStylesheet }));
	await page.route("https://fonts.googleapis.com/css2**", (route) =>
		route.fulfill({ contentType: "text/css", body: fontStylesheet }),
	);
	await page.route("https://fonts.gstatic.com/**", (route) => {
		const body = fontFiles.get(route.request().url());
		if (!body) {
			throw new Error("Unpinned font request.");
		}
		return route.fulfill({
			contentType: "font/woff2",
			headers: { "access-control-allow-origin": "*" },
			body,
		});
	});
}

export async function openWorkspace(page: Page, user: WorkspaceUser) {
	const notes = watchPageErrors(page);
	const authNotes = await recordAuthNotes(page);
	await page.goto("/signin");
	await page.getByLabel("Email").fill(user.email);
	await page.getByLabel("Password").fill(user.password);
	await page.getByRole("button", { name: "Sign in" }).click();
	try {
		await expect(page).toHaveURL(/\/overview$/, { timeout: 20_000 });
	} catch {
		const alert = (await page.getByRole("alert").allTextContents()).join(" ").trim();
		const detail = [...authNotes, ...notes].join(" | ");
		throw new Error(`Sign-in stayed on ${page.url()}. Alert: ${alert || "none"}. Notes: ${detail || "none"}.`);
	}
	await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();
}

export async function generatedEvents(accountId: string) {
	const secrets = secretsFor(["testDatabase"]);
	const postgres = openPostgres(secrets.testDatabase);
	try {
		const rows = await postgres.db.select().from(schema.busEvents).where(eq(schema.busEvents.accountId, accountId));
		return rows.filter((row) => /^e\d+$/.test(row.id)).sort((left, right) => left.seq - right.seq);
	} finally {
		await postgres.close();
	}
}

export function mainSection(name: "Sidebar" | "CHAT DOCK") {
	const source = readFileSync(new URL("../design/Main.dc.html", import.meta.url), "utf8");
	const marker =
		name === "Sidebar"
			? "<!-- Sidebar (one account's workspace) -->"
			: "<!-- ============ CHAT DOCK (every workspace page) ============ -->";
	const start = source.indexOf(marker);
	if (start < 0) {
		throw new Error(`The ${name} section is missing.`);
	}
	const rest = source.slice(start);
	const endMarker = name === "Sidebar" ? "<!-- Main -->" : "</x-dc>";
	const end = rest.indexOf(endMarker);
	if (end < 0) {
		throw new Error(`The ${name} section does not end.`);
	}
	return designInventory("Main.dc.html", `<x-dc>${rest.slice(marker.length, end)}</x-dc>`);
}

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

async function deleteAccount(sql: ReturnType<typeof neon>, accountId: string) {
	for (const table of childTables) {
		await sql.query(`delete from ${table} where account_id = $1`, [accountId]);
	}
	await sql.query("delete from accounts where id = $1", [accountId]);
}
