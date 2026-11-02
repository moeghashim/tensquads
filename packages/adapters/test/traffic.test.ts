import assert from "node:assert/strict";
import test from "node:test";
import { type AppDatabase, createRepositories, schema } from "@tensquads/adapters";
import { Kernel } from "@tensquads/kernel";
import { and, asc, eq } from "drizzle-orm";
import { replaceDemoAccount } from "../../seed/src/demo-account.ts";
import { openPglite } from "./pglite.ts";

const stock = '["Black hoodie M","A3 frame"]';
const daily = "Daily stock check";

interface QueryLogger {
	logQuery(query: string, params: unknown[]): void;
}

function scope(accountId: string) {
	return { accountId, mode: "account" as const };
}

async function withCopy(
	name: string,
	run: (db: AppDatabase, accountId: string) => Promise<void>,
	logger?: QueryLogger,
) {
	const { db, close } = await openPglite(logger);
	const accountId = `traffic-${name}`;
	try {
		await replaceDemoAccount(db, accountId, `clerk-${name}`);
		await run(db, accountId);
	} finally {
		await close();
	}
}

async function listed(db: AppDatabase, accountId: string) {
	return createRepositories(db).bus.listEvents(scope(accountId));
}

async function orderedRows(db: AppDatabase, accountId: string) {
	return db
		.select()
		.from(schema.busEvents)
		.where(eq(schema.busEvents.accountId, accountId))
		.orderBy(asc(schema.busEvents.seq));
}

async function cursor(db: AppDatabase, accountId: string) {
	const rows = await db.select().from(schema.busCursors).where(eq(schema.busCursors.accountId, accountId));
	const row = rows[0];
	assert.ok(row);
	return row;
}

async function storeValue(db: AppDatabase, accountId: string, key: string) {
	const rows = await db
		.select()
		.from(schema.stateEntries)
		.where(and(eq(schema.stateEntries.accountId, accountId), eq(schema.stateEntries.key, key)));
	const row = rows[0];
	assert.ok(row);
	return JSON.parse(row.value) as unknown;
}

function generated<T extends { id: string; seq: number }>(rows: readonly T[]): T[] {
	return rows.filter((row) => /^e\d+$/.test(row.id)).sort((left, right) => left.seq - right.seq);
}

test("events stay in sequence order when two events share a time", async () => {
	await withCopy("order", async (db, accountId) => {
		const events = await listed(db, accountId);
		const rows = await orderedRows(db, accountId);
		assert.deepEqual(
			events.map((event) => event.id),
			rows.map((row) => row.id),
		);
		const support = events.findIndex((event) => event.id === "e1043supportmaster");
		const relay = events.findIndex((event) => event.id === "e1043masterorders");
		assert.ok(support >= 0 && relay > support);
		assert.equal(events[support]?.time, "10:43");
		assert.equal(events[relay]?.time, "10:43");
		const supportRow = rows.find((row) => row.id === "e1043supportmaster");
		const relayRow = rows.find((row) => row.id === "e1043masterorders");
		assert.ok(supportRow && relayRow && supportRow.seq < relayRow.seq);
	});
});

test("one nextEvent adds the row and its writes in one transaction", async () => {
	const queries: string[] = [];
	await withCopy(
		"write",
		async (db, accountId) => {
			const kernel = new Kernel(createRepositories(db));
			const before = await orderedRows(db, accountId);
			await kernel.nextEvent(scope(accountId));
			const afterFirst = await orderedRows(db, accountId);
			const added = generated(afterFirst);
			assert.equal(added.length, 1);
			assert.equal(added[0]?.id, "e100");
			assert.equal(added[0]?.timeText, "11:03");
			assert.equal(added[0]?.body, daily);
			assert.equal(afterFirst.length, before.length + 1);
			assert.equal(await storeValue(db, accountId, "inventory.low_stock"), stock);
			const firstCursor = await cursor(db, accountId);
			assert.equal(firstCursor.seq, 101);
			assert.equal(firstCursor.clock, 663);
			assert.equal(firstCursor.scriptIndex, 1);
			await db
				.update(schema.stateEntries)
				.set({ value: JSON.stringify("before-write") })
				.where(
					and(eq(schema.stateEntries.accountId, accountId), eq(schema.stateEntries.key, "inventory.low_stock")),
				);
			assert.equal(await storeValue(db, accountId, "inventory.low_stock"), "before-write");
			queries.length = 0;
			await kernel.nextEvent(scope(accountId));
			const afterSecond = await orderedRows(db, accountId);
			const second = generated(afterSecond);
			assert.equal(second.length, 2);
			assert.equal(second[1]?.id, "e101");
			assert.equal(second[1]?.body, "2 products under 10: Black hoodie M (6), A3 frame (8)");
			assert.equal(await storeValue(db, accountId, "inventory.low_stock"), stock);
			const secondCursor = await cursor(db, accountId);
			assert.equal(secondCursor.seq, 102);
			assert.equal(secondCursor.clock, 664);
			assert.equal(secondCursor.scriptIndex, 2);
			assertOneTransaction(queries);
		},
		{ logQuery: (query) => queries.push(query) },
	);
});

test("a repeat id changes nothing and the next call adds the event", async () => {
	await withCopy("repeat", async (db, accountId) => {
		const beforeRows = await orderedRows(db, accountId);
		const beforeStore = await storeValue(db, accountId, "inventory.low_stock");
		const beforeCursor = await cursor(db, accountId);
		await db.insert(schema.busEvents).values({
			accountId,
			id: "e100",
			timeText: "11:03",
			fromAgent: "master",
			toAgent: "inventory",
			kind: "Task",
			skill: "shopify.stock_levels",
			body: "already seen",
			payload: {},
			writes: [],
			trace: "tr_repeat",
			seq: beforeCursor.seq - 1,
		});
		await new Kernel(createRepositories(db)).nextEvent(scope(accountId));
		const held = await orderedRows(db, accountId);
		assert.equal(held.length, beforeRows.length + 1);
		assert.equal(held.find((row) => row.id === "e100")?.body, "already seen");
		assert.equal(await storeValue(db, accountId, "inventory.low_stock"), beforeStore);
		const heldCursor = await cursor(db, accountId);
		assert.equal(heldCursor.seq, beforeCursor.seq);
		assert.equal(heldCursor.clock, beforeCursor.clock);
		assert.equal(heldCursor.scriptIndex, beforeCursor.scriptIndex);
		await db
			.delete(schema.busEvents)
			.where(and(eq(schema.busEvents.accountId, accountId), eq(schema.busEvents.id, "e100")));
		await new Kernel(createRepositories(db)).nextEvent(scope(accountId));
		const added = generated(await orderedRows(db, accountId));
		assert.equal(added.length, 1);
		assert.equal(added[0]?.id, "e100");
		assert.equal(added[0]?.body, daily);
		assert.equal((await cursor(db, accountId)).seq, beforeCursor.seq + 1);
	});
});

test("the script starts again after eight events", async () => {
	await withCopy("wrap", async (db, accountId) => {
		const kernel = new Kernel(createRepositories(db));
		for (let step = 0; step < 9; step += 1) {
			await kernel.nextEvent(scope(accountId));
		}
		const rows = generated(await orderedRows(db, accountId));
		assert.equal(rows.length, 9);
		assert.equal(rows[0]?.id, "e100");
		assert.equal(rows[0]?.body, daily);
		assert.equal(rows[8]?.id, "e108");
		assert.equal(rows[8]?.body, daily);
		assert.equal(rows.filter((row) => row.body === daily).length, 2);
		const saved = await cursor(db, accountId);
		assert.equal(saved.seq, 109);
		assert.equal(saved.clock, 671);
		assert.equal(saved.scriptIndex, 9);
	});
});

function assertOneTransaction(queries: readonly string[]) {
	const locks = queries.filter((query) => query.includes("pg_advisory_xact_lock"));
	assert.equal(locks.length, 1);
	const insertAt = queries.findIndex((query) => /insert into "?bus_events"?/i.test(query));
	const stateAt = queries.findIndex((query) => /(?:insert into|update) "?state_entries"?/i.test(query));
	assert.ok(insertAt >= 0 && stateAt > insertAt);
	assert.equal(
		queries.slice(insertAt + 1, stateAt).some((query) => query.includes("pg_advisory_xact_lock")),
		false,
	);
}
