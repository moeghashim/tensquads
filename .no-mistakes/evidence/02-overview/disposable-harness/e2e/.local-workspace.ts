import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { openPostgres, schema, workspaceTransaction } from "@tensquads/adapters";
import { eq, sql } from "drizzle-orm";
import { replaceDemoAccount } from "../packages/seed/src/demo-account.ts";
import { designInventory } from "../scripts/design-inventory.mjs";
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
] as const;

export interface WorkspaceUser {
	readonly email: string;
	readonly password: string;
	readonly userId: string;
	readonly accountId: string;
}

export const test = base.extend({
 workspaceUser: async ({request},use)=>{await request.get('http://127.0.0.1:3000/__test/reset');await use({email:'local',password:'local',userId:'local-test-user',accountId:'local-test-account'});},
 accountId: async ({workspaceUser},use)=>{await use(workspaceUser.accountId);}
});

export { expect };

export async function installLocalFonts(page: Page) {
	await installPinnedFonts(page, true);
}

export async function openWorkspace(page,user){await page.goto('/overview');await expect(page.getByRole('navigation',{name:'Workspace'})).toBeVisible();}
export async function generatedEvents(accountId){const state=await fetch('http://127.0.0.1:3000/__test/state').then(r=>r.json());return state.bus_events.filter(e=>/^e\d+$/.test(e.id)).sort((a,b)=>a.seq-b.seq);}

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

export async function deleteWorkspaceAccount(accountId: string): Promise<void> {
	const secrets = secretsFor(["testDatabase"]);
	const postgres = openPostgres(secrets.testDatabase);
	try {
		await workspaceTransaction(postgres.db, async (tx) => {
			for (const table of childTables) {
				await tx.execute(sql`delete from ${sql.identifier(table)} where account_id = ${accountId}`);
			}
			await tx.delete(schema.accounts).where(eq(schema.accounts.id, accountId));
		});
	} finally {
		await postgres.close();
	}
}
