import assert from "node:assert/strict";
import test from "node:test";
import type { AccountEventBus, AccountScope } from "@tensquads/kernel";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import {
	insertBusEvent,
	insertBusEvents,
	insertStateRows,
	upsertStateValue,
} from "../src/cloudflare-bus/neon-write.ts";
import { decide } from "../src/neon/commands/approvals.ts";
import { appendEvents } from "../src/neon/commands/bus.ts";
import { conversationTransaction } from "../src/neon/commands/conversation.ts";
import { setLimit } from "../src/neon/commands/rules.ts";
import { nextEvent } from "../src/neon/commands/traffic.ts";
import type { AppDatabase } from "../src/neon/postgres.ts";
import { saveWorkspace, writeAccount } from "../src/neon/save.ts";
import { accounts, agents, approvals, busCursors, busEvents, stateEntries } from "../src/neon/schema.ts";
import type { AccountSnapshot } from "../src/neon/snapshot.ts";

test("real mode bus writes go through the durable object", async () => {
	const previous = process.env.ADAPTERS;
	const draft = {
		from: "master",
		to: "researcher",
		kind: "Task" as const,
		skill: "research",
		text: "Look at the market.",
		payload: {},
	};
	let inserted = false;
	const tx = {
		insert() {
			inserted = true;
			throw new Error("inserted");
		},
	};
	try {
		process.env.ADAPTERS = "real";
		await assert.rejects(
			() => appendEvents(tx as never, "acct", [draft], new Date()),
			/A bus write in real mode must go through the Durable Object\./,
		);
		assert.equal(inserted, false);
	} finally {
		if (previous === undefined) delete process.env.ADAPTERS;
		else process.env.ADAPTERS = previous;
	}
});

type Rows = readonly Record<string, unknown>[];

interface Query extends Promise<Rows> {
	where(condition: unknown): Query;
	orderBy(order: unknown): Query;
	for(mode: string): Query;
	values(value: unknown): Query;
	set(value: unknown): Query;
	onConflictDoNothing(): Query;
	onConflictDoUpdate(config: unknown): Query;
}

function query(rows: Rows = []): Query {
	const result: Query = Object.assign(Promise.resolve(rows), {
		where: (_condition: unknown) => result,
		orderBy: (_order: unknown) => result,
		for: (_mode: string) => result,
		values: (_value: unknown) => result,
		set: (_value: unknown) => result,
		onConflictDoNothing: () => result,
		onConflictDoUpdate: (_config: unknown) => result,
	});
	return result;
}

function recordingDatabase() {
	const counts = { inserts: 0, updates: 0 };
	const dialect = new PgDialect();
	const rows = new Map<unknown, Rows>([
		[busCursors, [{ seq: 100, clock: 662, scriptIndex: 0 }]],
		[approvals, [{ id: "p1", agent: "orders", status: "Pending", title: "Refund", detail: "", amount: "$42" }]],
		[agents, [{ id: "orders", tasks: 0, lastText: "" }]],
		[accounts, [{ owner: "Moe" }]],
	]);
	function isBusTable(table: unknown): boolean {
		return table === busEvents || table === stateEntries;
	}
	const tx = {
		insert(table: unknown) {
			if (isBusTable(table)) counts.inserts += 1;
			return query();
		},
		update(table: unknown) {
			if (isBusTable(table)) counts.updates += 1;
			return query();
		},
		delete(_table: unknown) {
			return query();
		},
		select() {
			return { from: (table: unknown) => query(rows.get(table)) };
		},
		async execute(statement: SQL) {
			const sql = dialect.sqlToQuery(statement).sql.trim();
			return sql.startsWith("INSERT INTO write_fences") ? [{ account_id: "acct" }] : [];
		},
	};
	const db = {
		...tx,
		async transaction<T>(work: (transaction: typeof tx) => Promise<T>): Promise<T> {
			return work(tx);
		},
	};
	return { db: db as unknown as AppDatabase, tx, counts };
}

const snapshot: AccountSnapshot = {
	account: {
		id: "acct",
		name: "Trial",
		owner: "Moe",
		email: "trial@example.com",
		plan: "Starter",
		tint: "#fff",
		squads: [],
		agents: 0,
		online: 0,
		tasks: 0,
		lastActive: "",
		status: "Trial",
		createdWeek: 0,
		started: "",
		mrr: 0,
		ltv: 0,
		mission: "",
	},
	agents: [],
	events: [],
	store: {},
	rules: [],
	approvals: [],
	proposals: [],
	revenue: [],
	tiles: null,
	messages: [],
	masterName: "Petra",
};

type AdvanceTraffic = (
	db: AppDatabase,
	scope: AccountScope,
	startedAt: number,
	bus: AccountEventBus,
) => Promise<string>;
type Refresh = () => void;
interface TrafficControls {
	registerTrafficAdvance(fn: (options: { data: string; signal: AbortSignal }) => Promise<string>): void;
	runLiveTick(tick: { accountId: string; live: boolean; refresh: Refresh }): Promise<void>;
	sendNextEvent(refresh: Refresh, accountId: string): Promise<void>;
	consumeQueuedEvent(): string;
}

test("real mode routes traffic through the object and refuses other bus writers", async () => {
	const previous = process.env.ADAPTERS;
	const scope: AccountScope = { accountId: "acct", mode: "account" };
	const probe = recordingDatabase();
	for (const table of [busCursors, busEvents, stateEntries]) {
		await probe.tx.insert(table).values({});
		await probe.tx.update(table).set({});
	}
	assert.deepEqual(probe.counts, { inserts: 2, updates: 2 });
	const { db, tx, counts } = recordingDatabase();
	const trafficPath = "../../../apps/web/src/server/traffic-step.ts";
	const controlsPath = "../../../apps/web/src/workspace/live.ts";
	const { advanceTrafficAccount }: { advanceTrafficAccount: AdvanceTraffic } = await import(trafficPath);
	const controls: TrafficControls = await import(controlsPath);
	let advances = 0;
	let refreshes = 0;
	const bus: AccountEventBus = {
		async nextEvent(receivedScope) {
			assert.deepEqual(receivedScope, scope);
			advances += 1;
			return {
				id: `e${advances}`,
				from: "master",
				to: "orders",
				kind: "Task",
				skill: "test",
				text: "",
				payload: {},
				writes: [],
			};
		},
		async events() {
			return [];
		},
		async store() {
			return {};
		},
		async publish() {
			throw new Error("Unexpected publish.");
		},
	};
	const draft = { from: "master", to: "orders", kind: "Task" as const, skill: "test", text: "", payload: {} };
	try {
		process.env.ADAPTERS = "real";
		assert.equal(await advanceTrafficAccount(db, scope, Date.now(), bus), "e1");
		assert.equal(advances, 1);
		assert.deepEqual(counts, { inserts: 0, updates: 0 });
		controls.registerTrafficAdvance(({ data }) => {
			assert.equal(data, scope.accountId);
			return advanceTrafficAccount(db, scope, Date.now(), bus);
		});
		const refresh = () => {
			refreshes += 1;
		};
		await controls.runLiveTick({ accountId: scope.accountId, live: true, refresh });
		assert.equal(advances, 2);
		assert.equal(controls.consumeQueuedEvent(), "e2");
		assert.deepEqual(counts, { inserts: 0, updates: 0 });
		await controls.sendNextEvent(refresh, scope.accountId);
		assert.equal(advances, 3);
		assert.equal(controls.consumeQueuedEvent(), "e3");
		assert.equal(refreshes, 2);
		assert.deepEqual(counts, { inserts: 0, updates: 0 });
		const writers: readonly [string, () => Promise<unknown>][] = [
			["traffic", () => nextEvent(db, scope)],
			["insert event", () => insertBusEvent(tx, {})],
			["insert events", () => insertBusEvents(tx, [{}])],
			["upsert state", () => upsertStateValue(tx, { accountId: "acct", key: "test", value: "1", sortOrder: 0 })],
			["insert state", () => insertStateRows(tx, [{}])],
			["save workspace", () => saveWorkspace(db, { accounts: [snapshot], images: [], plans: [] })],
			["write account", () => writeAccount(db, snapshot)],
			["limit", () => setLimit(db, scope, "policy.refund_auto_limit", 50, { tab: "tab", seq: 1 })],
			["conversation", () => conversationTransaction(db, scope, (commands) => commands.appendEvent(draft))],
			["approve", () => decide(db, scope, "p1", true)],
			["decline", () => decide(db, scope, "p1", false)],
		];
		for (const [name, write] of writers) {
			await assert.rejects(
				write,
				{ message: "A bus write in real mode must go through the Durable Object." },
				name,
			);
			assert.deepEqual(counts, { inserts: 0, updates: 0 }, name);
		}
	} finally {
		if (previous === undefined) delete process.env.ADAPTERS;
		else process.env.ADAPTERS = previous;
	}
});
