import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { openPostgres, schema, workspaceTransaction } from "@tensquads/adapters";
import { eq, sql } from "drizzle-orm";
import { replaceDemoAccount } from "../packages/seed/src/demo-account.ts";
import { designInventory } from "../scripts/design-inventory.mjs";
import { createClerkUser } from "./clerk-user.ts";
import { installPinnedFonts } from "./fonts.ts";
import { test as base, expect, recordAuthNotes, secretsFor, watchPageErrors } from "./support.ts";

const childTables = [
	"messages",
	"threads",
	"skills",
	"machines",
	"agents",
	"squads",
	"masters",
	"rules",
	"mission_proposals",
	"bus_events",
	"state_entries",
	"daily_revenue",
	"overview_tiles",
	"subscriptions",
	"bus_cursors",
	"write_fences",
	"retired_tabs",
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
			let userId = "";
			let accountId = "";
			try {
				userId = await createClerkUser(secrets.secret, email, password);
				accountId = `frame-${workerInfo.workerIndex}-${randomUUID().slice(0, 8)}`;
				const postgres = openPostgres(secrets.testDatabase);
				try {
					await postgres.migrate();
					await replaceDemoAccount(postgres.db, accountId, userId);
				} finally {
					await postgres.close();
				}
				await use({ email, password, userId, accountId });
			} finally {
				try {
					if (accountId.length > 0) await deleteWorkspaceAccount(accountId);
				} finally {
					if (userId.length > 0) await deleteClerkUser(secrets.secret, userId);
				}
			}
		},
		{ scope: "worker" },
	],
	accountId: [
		async ({ workspaceUser }, use) => {
			const secrets = secretsFor(["testDatabase"]);
			const postgres = openPostgres(secrets.testDatabase);
			try {
				await replaceDemoAccount(postgres.db, workspaceUser.accountId, workspaceUser.userId);
			} finally {
				await postgres.close();
			}
			await use(workspaceUser.accountId);
		},
		{ auto: true },
	],
});

export { expect };

export async function installLocalFonts(page: Page) {
	await installPinnedFonts(page, true);
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

export async function deleteWorkspaceAccount(accountId: string): Promise<void> {
	const secrets = secretsFor(["testDatabase"]);
	const postgres = openPostgres(secrets.testDatabase);
	try {
		await workspaceTransaction(
			postgres.db,
			async (tx) => {
				for (const table of childTables) {
					await tx.execute(sql`delete from ${sql.identifier(table)} where account_id = ${accountId}`);
				}
				await tx.delete(schema.accounts).where(eq(schema.accounts.id, accountId));
			},
			{ accountId },
		);
	} finally {
		await postgres.close();
	}
}
