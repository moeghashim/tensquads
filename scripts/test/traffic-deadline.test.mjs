import assert from "node:assert/strict";
import test from "node:test";
import { createRepositories, schema } from "@tensquads/adapters";
import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";
import { Kernel } from "@tensquads/kernel";
import { eq } from "drizzle-orm";

import { advanceTrafficAccount } from "../../apps/web/src/server/traffic-step.ts";
import { openPglite } from "../../packages/adapters/test/pglite.ts";
import { replaceDemoAccount } from "../../packages/seed/src/demo-account.ts";

const unfinished = "The workspace write did not finish.";

function isUnfinished(error, depth = 0) {
	if (!error || typeof error !== "object" || depth > 5) return false;
	if (error.message === unfinished) return true;
	return isUnfinished(error.cause, depth + 1);
}

function watchBusReads(client, onSelect) {
	const originalQuery = client.query.bind(client);
	client.query = async (text, params, options) => {
		onSelect(String(text));
		return originalQuery(text, params, options);
	};
	const originalTransaction = client.transaction.bind(client);
	client.transaction = async (callback, ...rest) => {
		return originalTransaction(
			async (tx) => {
				const query = tx.query.bind(tx);
				tx.query = async (text, params, options) => {
					onSelect(String(text));
					return query(text, params, options);
				};
				return callback(tx);
			},
			...rest,
		);
	};
	return () => {
		client.query = originalQuery;
		client.transaction = originalTransaction;
	};
}

async function generatedCount(db, accountId) {
	const rows = await db.select().from(schema.busEvents).where(eq(schema.busEvents.accountId, accountId));
	return rows.filter((row) => /^e\d+$/.test(row.id)).length;
}

async function withAccount(name, run) {
	const opened = await openPglite();
	const accountId = `traffic-deadline-${name}`;
	try {
		await replaceDemoAccount(opened.db, accountId, `clerk-${name}`);
		await run(opened, accountId);
	} finally {
		await opened.close();
	}
}

function scope(accountId) {
	return { accountId, mode: "account" };
}

test("a read past the deadline commits nothing", async (t) => {
	await withAccount("read", async (opened, accountId) => {
		t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-02T12:00:00Z") });
		const before = await generatedCount(opened.db, accountId);
		let selects = 0;
		const restore = watchBusReads(opened.client, (sql) => {
			if (!/select/i.test(sql) || !/bus_events/i.test(sql)) return;
			selects += 1;
			if (selects === 1) t.mock.timers.tick(PENDING_TASK_WINDOW_MS + 2_000);
		});
		try {
			await assert.rejects(
				() => advanceTrafficAccount(opened.db, scope(accountId), Date.now()),
				(error) => isUnfinished(error),
			);
			assert.equal(selects >= 1, true);
			assert.equal(await generatedCount(opened.db, accountId), before);
		} finally {
			restore();
		}
		await new Kernel(createRepositories(opened.db)).nextEvent(scope(accountId));
		assert.equal(await generatedCount(opened.db, accountId), 1);
	});
});

test("a write past the original deadline commits nothing", async (t) => {
	await withAccount("write", async (opened, accountId) => {
		t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-02T12:00:00Z") });
		const before = await generatedCount(opened.db, accountId);
		let selects = 0;
		const restore = watchBusReads(opened.client, (sql) => {
			if (!/select/i.test(sql) || !/bus_events/i.test(sql)) return;
			selects += 1;
			if (selects === 1) t.mock.timers.tick(20_000);
			if (selects === 2) t.mock.timers.tick(15_000);
		});
		try {
			await assert.rejects(
				() => advanceTrafficAccount(opened.db, scope(accountId), Date.now()),
				(error) => isUnfinished(error),
			);
			assert.equal(selects >= 2, true);
			assert.equal(await generatedCount(opened.db, accountId), before);
		} finally {
			restore();
		}
		await new Kernel(createRepositories(opened.db)).nextEvent(scope(accountId));
		assert.equal(await generatedCount(opened.db, accountId), 1);
	});
});
