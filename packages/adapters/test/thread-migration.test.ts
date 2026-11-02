import assert from "node:assert/strict";
import test from "node:test";
import { type AppDatabase, schema } from "@tensquads/adapters";
import { and, eq, inArray, sql } from "drizzle-orm";
import { replaceDemoAccount } from "../../seed/src/demo-account.ts";
import { listMessages } from "../src/neon/commands/conversation.ts";
import { migrationSql } from "../src/neon/migration-sql.ts";
import { migrationStatements } from "../src/neon/postgres.ts";
import { openPglite } from "./pglite.ts";

async function migrateAgain(db: AppDatabase) {
	for (const statement of migrationStatements(migrationSql)) {
		await db.execute(sql.raw(statement));
	}
}

async function rowsFor(db: AppDatabase, accountId: string) {
	const rows = await db.select().from(schema.messages).where(eq(schema.messages.accountId, accountId));
	return rows
		.map((row) => ({
			id: row.id,
			threadId: row.threadId,
			fromRole: row.fromRole,
			agent: row.agent,
			body: row.body,
			sortOrder: row.sortOrder,
		}))
		.sort((left, right) => left.id.localeCompare(right.id));
}

async function threadIds(db: AppDatabase, accountId: string) {
	const rows = await db.select().from(schema.threads).where(eq(schema.threads.accountId, accountId));
	return rows.map((row) => row.id).sort();
}

test("a repeated migration moves main messages onto dock and keeps ids and order", async () => {
	const { db, close } = await openPglite();
	const mixed = "migrate-mixed";
	const onlyMain = "migrate-main";
	const onlyDock = "migrate-dock";
	try {
		await replaceDemoAccount(db, mixed, "clerk-mixed");
		await replaceDemoAccount(db, onlyMain, "clerk-main");
		await replaceDemoAccount(db, onlyDock, "clerk-dock");
		const mixedRows = await rowsFor(db, mixed);
		assert.ok(mixedRows.length > 2);
		const movedIds = mixedRows.slice(0, 2).map((row) => row.id);
		await db.insert(schema.threads).values({ accountId: mixed, id: "main", sortOrder: 1 });
		await db
			.update(schema.messages)
			.set({ threadId: "main" })
			.where(and(eq(schema.messages.accountId, mixed), inArray(schema.messages.id, movedIds)));
		await db.insert(schema.messages).values({
			accountId: mixed,
			threadId: "main",
			id: "kept-main",
			fromRole: "user",
			agent: null,
			body: "Kept id",
			sortOrder: 50,
		});
		await db.insert(schema.threads).values({ accountId: onlyMain, id: "main", sortOrder: 1 });
		await db.update(schema.messages).set({ threadId: "main" }).where(eq(schema.messages.accountId, onlyMain));
		await db.delete(schema.threads).where(and(eq(schema.threads.accountId, onlyMain), eq(schema.threads.id, "dock")));
		const before = {
			mixed: await rowsFor(db, mixed),
			onlyMain: await rowsFor(db, onlyMain),
			onlyDock: await rowsFor(db, onlyDock),
			mixedOrder: (await listMessages(db, mixed)).map((message) => message.id),
			mainOrder: (await listMessages(db, onlyMain)).map((message) => message.id),
		};
		assert.ok(before.mixed.some((row) => row.threadId === "main"));
		assert.ok(before.onlyMain.every((row) => row.threadId === "main"));
		assert.deepEqual(await threadIds(db, onlyMain), ["main"]);

		await migrateAgain(db);
		await migrateAgain(db);

		const afterMixed = await rowsFor(db, mixed);
		const afterMain = await rowsFor(db, onlyMain);
		assert.deepEqual(
			afterMixed.map((row) => row.threadId),
			afterMixed.map(() => "dock"),
		);
		assert.deepEqual(
			afterMixed.map(({ threadId: _threadId, ...row }) => row),
			before.mixed.map(({ threadId: _threadId, ...row }) => row),
		);
		assert.deepEqual(
			(await listMessages(db, mixed)).map((message) => message.id),
			before.mixedOrder,
		);
		assert.deepEqual(
			afterMain.map(({ threadId: _threadId, ...row }) => row),
			before.onlyMain.map(({ threadId: _threadId, ...row }) => row),
		);
		assert.deepEqual(
			(await listMessages(db, onlyMain)).map((message) => message.id),
			before.mainOrder,
		);
		assert.deepEqual(await rowsFor(db, onlyDock), before.onlyDock);
		assert.deepEqual(await threadIds(db, mixed), ["dock"]);
		assert.deepEqual(await threadIds(db, onlyMain), ["dock"]);
		assert.deepEqual(await threadIds(db, onlyDock), ["dock"]);
		assert.equal(afterMixed.find((row) => row.id === "kept-main")?.body, "Kept id");
	} finally {
		await close();
	}
});
