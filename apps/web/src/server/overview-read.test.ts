import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "@neondatabase/serverless";
import { createRepositories, openPostgres, saveWorkspace, schema } from "@tensquads/adapters";
import { TASKS_DONE_LABEL } from "@tensquads/domain";
import { Kernel } from "@tensquads/kernel";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { openPglite } from "../../../../packages/adapters/test/pglite.ts";
import { replaceDemoAccount } from "../../../../packages/seed/src/demo-account.ts";
import { workspaceFromDesign } from "../../../../packages/seed/src/index.ts";
import { readOverview } from "./overview-read.ts";

const demo = { accountId: "demo", mode: "account" as const };
const leen = { accountId: "leen", mode: "account" as const };

test("the overview read computes the demo screen in twelve queries", async () => {
	let count = 0;
	const opened = await openPglite({
		logQuery(query) {
			if (query.toLowerCase().startsWith("select")) count += 1;
		},
	});
	try {
		await saveWorkspace(opened.db, workspaceFromDesign());
		count = 0;
		const page = await readOverview(opened.db, demo);
		assert.equal(count, 12);
		assert.equal(page.greeting, "Good morning, Moe");
		assert.equal(page.online, "4 of 5 squads online");
		assert.equal(page.tiles[0]?.value, "$8,420");
		assert.equal(page.tiles[4]?.label, TASKS_DONE_LABEL);
		assert.equal(page.tiles[4]?.value, "331");
		assert.equal(page.tiles[5]?.value, "34h");
		assert.equal(page.bars.length, 14);
		assert.equal(page.bars[0]?.h, 65);
		assert.equal(page.bars[0]?.label, "14");
		assert.equal(page.count, 4);
		assert.equal(page.empty, false);
		assert.equal(page.proposals.length, 1);
		assert.equal(page.approvals.length, 3);
		assert.equal(page.agents.length, 5);
		assert.equal(page.agents.filter((agent) => agent.mission.length === 0).length, 1);
	} finally {
		await opened.close();
	}
});

test("an account with no store shows dashes, zero tasks, and an empty inbox", async () => {
	const opened = await openPglite();
	try {
		await saveWorkspace(opened.db, workspaceFromDesign());
		const page = await readOverview(opened.db, leen);
		assert.deepEqual(
			page.tiles.map((tile) => tile.value),
			["—", "—", "—", "—", "0", "—"],
		);
		assert.equal(page.tiles[0]?.delta, "\u00a0");
		assert.equal(page.tiles[4]?.delta, "This week");
		assert.equal(page.bars.length, 0);
		assert.equal(page.empty, true);
		assert.equal(page.emptyText, "Nothing waiting. Your squads are working inside their limits.");
		assert.equal(page.count, 0);
		assert.match(page.greeting, /^Good morning, /);
	} finally {
		await opened.close();
	}
});

const connection = process.env.TEST_DATABASE_URL ?? "";

async function removeSnapshotAccount(db: ReturnType<typeof openPostgres>["db"], accountId: string) {
	await db.delete(schema.messages).where(eq(schema.messages.accountId, accountId));
	await db.delete(schema.threads).where(eq(schema.threads.accountId, accountId));
	await db.delete(schema.skills).where(eq(schema.skills.accountId, accountId));
	await db.delete(schema.machines).where(eq(schema.machines.accountId, accountId));
	await db.delete(schema.agents).where(eq(schema.agents.accountId, accountId));
	await db.delete(schema.squads).where(eq(schema.squads.accountId, accountId));
	await db.delete(schema.masters).where(eq(schema.masters.accountId, accountId));
	await db.delete(schema.rules).where(eq(schema.rules.accountId, accountId));
	await db.delete(schema.missionProposals).where(eq(schema.missionProposals.accountId, accountId));
	await db.delete(schema.busEvents).where(eq(schema.busEvents.accountId, accountId));
	await db.delete(schema.stateEntries).where(eq(schema.stateEntries.accountId, accountId));
	await db.delete(schema.dailyRevenue).where(eq(schema.dailyRevenue.accountId, accountId));
	await db.delete(schema.overviewTiles).where(eq(schema.overviewTiles.accountId, accountId));
	await db.delete(schema.subscriptions).where(eq(schema.subscriptions.accountId, accountId));
	await db.delete(schema.busCursors).where(eq(schema.busCursors.accountId, accountId));
	await db.delete(schema.accounts).where(eq(schema.accounts.id, accountId));
}

test("an Overview stays on one snapshot when another client approves after its first query", {
	skip: !connection,
}, async (t) => {
	const pool = new Pool({ connectionString: connection });
	const writer = openPostgres(connection);
	const client = await pool.connect();
	const accountId = `overview-snapshot-${crypto.randomUUID()}`;
	const scope = { accountId, mode: "account" as const };
	try {
		await writer.migrate();
		await replaceDemoAccount(writer.db, accountId, `clerk-${accountId}`);
		const before = await readOverview(writer.db, scope);
		const db = drizzle(client, { schema });
		const query = client.query;
		let committed = false;
		t.mock.method(client, "query", async (...args: unknown[]) => {
			const result = await Reflect.apply(query, client, args);
			const command = args[0];
			const text = typeof command === "string" ? command : (command as { text: string }).text;
			if (!committed && text.toLowerCase().startsWith("select")) {
				committed = true;
				await new Kernel(createRepositories(writer.db)).decide(scope, "ap1", true);
			}
			return result;
		});
		const page = await readOverview(db, scope);
		assert.equal(committed, true);
		assert.equal(page.count, 4);
		assert.equal(page.tiles[4]?.value, "331");
		assert.equal(
			page.agents.reduce((sum, agent) => sum + agent.tasks, 0),
			331,
		);
		assert.ok(page.approvals.some((approval) => approval.id === "ap1"));
		assert.equal(
			page.agents.find((agent) => agent.id === "support")?.last,
			before.agents.find((agent) => agent.id === "support")?.last,
		);
		const fresh = await readOverview(writer.db, scope);
		assert.equal(fresh.count, 3);
		assert.equal(fresh.tiles[4]?.value, "332");
		assert.equal(
			fresh.agents.reduce((sum, agent) => sum + agent.tasks, 0),
			332,
		);
		assert.equal(
			fresh.approvals.some((approval) => approval.id === "ap1"),
			false,
		);
		assert.equal(
			fresh.agents.find((agent) => agent.id === "support")?.last,
			`${before.approvals.find((approval) => approval.id === "ap1")?.title} (approved)`,
		);
	} finally {
		t.mock.restoreAll();
		try {
			await removeSnapshotAccount(writer.db, accountId);
		} finally {
			await client.query("rollback").catch(() => undefined);
			client.release();
			await pool.end();
			await writer.close();
		}
	}
});
