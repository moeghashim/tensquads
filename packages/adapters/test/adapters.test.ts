import assert from "node:assert/strict";
import test from "node:test";

import { type Account, type Agent, MissingAccountScopeError } from "@tensquads/domain";
import { Kernel } from "@tensquads/kernel";
import { sql } from "drizzle-orm";

import {
	createMemoryBus,
	createPlaceholderServices,
	createRepositories,
	createTestMachine,
	openPglite,
	saveWorkspace,
	traceFor,
	type WorkspaceSnapshot,
} from "../src/index.ts";

const platform = { accountId: "platform", mode: "platform" } as const;
const demo = { accountId: "demo", mode: "account" } as const;
const other = { accountId: "other", mode: "account" } as const;

test("trace is a hash of the event id", () => {
	assert.equal(traceFor("e1041masterorders"), traceFor("e1041masterorders"));
	assert.match(traceFor("e1041masterorders"), /^tr_[0-9a-f]{6}$/);
	assert.notEqual(traceFor("e1041masterorders"), traceFor("e1042ordersmaster"));
});

test("an off machine reports CPU 0% and uptime Paused", () => {
	const machine = createTestMachine([
		{
			id: "inventory",
			on: false,
			host: "vps-inventory-01",
			region: "Frankfurt",
			size: "1 vCPU · 2 GB",
			cpu: "14%",
			uptime: "18 days",
			egress: ["shopify.com"],
			secrets: ["SHOPIFY_STOCK_TOKEN"],
		},
	]);
	assert.equal(machine.cpu("inventory"), "0%");
	assert.equal(machine.uptime("inventory"), "Paused");
	assert.equal(machine.host("inventory"), "vps-inventory-01");
});

test("an on machine reports Just started when its stored uptime is Paused", () => {
	const machine = createTestMachine([
		{
			id: "orders",
			on: true,
			host: "vps-orders-01",
			region: "Frankfurt",
			size: "2 vCPU · 4 GB",
			cpu: "14%",
			uptime: "Paused",
			egress: ["shopify.com"],
			secrets: ["SHOPIFY_ORDERS_TOKEN"],
		},
		{
			id: "inventory",
			on: true,
			host: "vps-inventory-01",
			region: "Frankfurt",
			size: "1 vCPU · 2 GB",
			cpu: "9%",
			uptime: "18 days",
			egress: ["shopify.com"],
			secrets: ["SHOPIFY_STOCK_TOKEN"],
		},
	]);
	assert.equal(machine.uptime("orders"), "Just started");
	assert.equal(machine.cpu("orders"), "14%");
	assert.equal(machine.uptime("inventory"), "18 days");
	assert.equal(machine.cpu("inventory"), "9%");
	assert.deepEqual(machine.makeTemplate("orders"), { id: "template-orders" });
	assert.deepEqual(machine.startFromTemplate("template-orders", "orders"), {
		templateId: "template-orders",
		agentId: "orders",
	});
});

test("the memory bus appends the next event and applies its set", () => {
	const bus = createMemoryBus({
		events: [],
		store: { "inventory.low_stock": "old" },
		trace: traceFor,
		script: [
			{
				from: "master",
				to: "inventory",
				kind: "Task",
				skill: "shopify.stock_levels",
				text: "Daily stock check",
				payload: { intent: "stock_check" },
				writes: ["inventory.low_stock"],
				set: { "inventory.low_stock": '["Black hoodie M","A3 frame"]' },
			},
		],
	});
	const event = bus.nextEvent();
	assert.equal(event?.id, "e100");
	assert.equal(event?.time, "11:03");
	assert.equal(event?.trace, traceFor("e100"));
	assert.equal(bus.store()["inventory.low_stock"], '["Black hoodie M","A3 frame"]');
	assert.equal(bus.events().length, 1);
});

test("the memory bus hashes each event id by default and preserves custom traces", () => {
	const input = {
		events: [],
		store: {},
		script: [
			{
				from: "master",
				to: "orders",
				kind: "Task" as const,
				skill: "orders.lookup",
				text: "Check order",
				payload: {},
				writes: [],
			},
		],
	};
	const bus = createMemoryBus(input);
	for (let index = 0; index < 2; index += 1) {
		const event = bus.nextEvent();
		assert.ok(event);
		assert.equal(event.trace, traceFor(event.id));
		assert.match(event.trace, /^tr_[0-9a-f]{6}$/);
	}
	const custom = createMemoryBus({ ...input, trace: (id) => `custom_${id}` });
	assert.equal(custom.nextEvent()?.trace, "custom_e100");
});

test("every store value round-trips as its own type", async () => {
	const opened = await openPglite();
	try {
		const snapshot = fixture();
		const store = {
			"inventory.low_stock": '["Black hoodie M","A3 frame"]',
			"policy.refund_auto_limit": 50,
			"policy.enabled": true,
			"policy.tags": ["hoodie", "frame"],
			"policy.meta": { limit: 50, on: false },
		};
		await saveWorkspace(opened.db, {
			...snapshot,
			accounts: snapshot.accounts.map((entry, index) => (index === 0 ? { ...entry, store } : entry)),
		});
		const read = await createRepositories(opened.db).bus.readStore(demo);
		assert.deepEqual(read, store);
		assert.equal(typeof read["inventory.low_stock"], "string");
		assert.equal(typeof read["policy.refund_auto_limit"], "number");
		assert.equal(typeof read["policy.enabled"], "boolean");
		assert.ok(Array.isArray(read["policy.tags"]));
		assert.equal(typeof read["policy.meta"], "object");
		assert.deepEqual(Object.keys(read), Object.keys(store));
	} finally {
		await opened.close();
	}
});

test("placeholder write returns the design value and does not change the store", () => {
	const store = { "policy.refund_auto_limit": 50 };
	const gateway = createPlaceholderServices(store);
	assert.equal(gateway.read("policy.refund_auto_limit"), 50);
	assert.equal(gateway.write("policy.refund_auto_limit", 1), 50);
	assert.equal(store["policy.refund_auto_limit"], 50);
});

const CATALOG_TABLES = new Set(["plans", "agent_images", "bugs", "feature_requests"]);

test("tenant tables have account_id and catalog tables do not", async () => {
	const opened = await openPglite();
	try {
		const result = (await opened.db.execute(
			sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
		)) as { rows: { table_name: string; column_name: string }[] };
		const columns = new Map<string, Set<string>>();
		for (const row of result.rows) {
			const names = columns.get(row.table_name) ?? new Set<string>();
			names.add(row.column_name);
			columns.set(row.table_name, names);
		}
		for (const [table, names] of columns) {
			if (CATALOG_TABLES.has(table)) {
				assert.equal(names.has("account_id"), false, table);
			} else {
				assert.equal(names.has("account_id"), true, table);
			}
		}
		assert.equal(columns.get("rules")?.has("rule_when"), true);
		assert.equal(columns.get("rules")?.has("when"), false);
		assert.equal(columns.get("bus_events")?.has("from_agent"), true);
		assert.equal(columns.get("bus_events")?.has("from"), false);
	} finally {
		await opened.close();
	}
});

test("repositories reject a missing scope and isolate accounts", async () => {
	const opened = await openPglite();
	try {
		await saveWorkspace(opened.db, fixture());
		const repos = createRepositories(opened.db);
		const kernel = new Kernel();
		kernel.repositories = repos;
		await assert.rejects(() => repos.platform.listAccounts(undefined as never), MissingAccountScopeError);

		const all = await repos.platform.totals(platform);
		assert.equal(all.accounts, 2);
		assert.equal(all.agents, 14);
		assert.equal(all.squads, 3);
		assert.equal(all.mrr, 159);
		assert.equal(all.allTime, 120);
		assert.equal(all.tasksDone, 31);
		assert.equal(all.images, 1);
		assert.equal(all.openBugs, 1);
		assert.equal(all.featuresRequested, 1);

		const demoAccounts = await repos.platform.listAccounts(demo);
		assert.equal(demoAccounts.length, 1);
		assert.equal(demoAccounts[0]?.id, "demo");
		assert.deepEqual(demoAccounts[0]?.squads, ["Store ops"]);
		const demoAgents = await repos.squads.listAgents(demo);
		assert.equal(demoAgents.length, 1);
		assert.equal(demoAgents[0]?.on, true);
		assert.equal(await repos.squads.tasksDone(demo), 31);
		const otherAgents = await repos.squads.listAgents(other);
		assert.equal(otherAgents.length, 0);
		const inbox = await repos.policy.inbox(demo);
		assert.equal(inbox.count, 2);
		assert.equal(inbox.empty, false);
		const rule = (await repos.policy.listRules(demo))[0];
		assert.equal(rule?.when, "a refund request comes in");
	} finally {
		await opened.close();
	}
});

test("a failed workspace replacement preserves every existing table", async () => {
	const opened = await openPglite();
	try {
		await saveWorkspace(opened.db, fixture());
		const tables = (await opened.db.execute(
			sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
		)) as { rows: { table_name: string }[] };
		const readTables = async () => {
			const rows = [];
			for (const { table_name } of tables.rows) {
				const result = (await opened.db.execute(sql`SELECT * FROM ${sql.identifier(table_name)}`)) as {
					rows: unknown[];
				};
				rows.push(result.rows);
			}
			return rows;
		};
		const before = await readTables();
		const replacement = fixture();
		await assert.rejects(() =>
			saveWorkspace(opened.db, {
				...replacement,
				accounts: [...replacement.accounts, ...replacement.accounts].map((entry) => ({
					...entry,
					account: { ...entry.account, name: "Replacement" },
				})),
			}),
		);
		assert.deepEqual(await readTables(), before);
	} finally {
		await opened.close();
	}
});

function fixture(): WorkspaceSnapshot {
	const account: Account = {
		id: "demo",
		name: "Demo store",
		owner: "Moe Ghashim",
		email: "moe@demostore.co",
		plan: "Growth",
		tint: "#e7efff",
		squads: ["Store ops"],
		agents: 5,
		online: 4,
		tasks: 331,
		lastActive: "2 min ago",
		status: "Active",
		createdWeek: -1,
		started: "3 Mar 2026",
		mrr: 149,
		ltv: 100,
		mission: "Reach $1M.",
	};
	const second: Account = {
		...account,
		id: "other",
		name: "Other",
		email: "other@example.com",
		squads: ["Wholesale", "Retail"],
		agents: 9,
		online: 8,
		tasks: 10,
		mrr: 10,
		ltv: 20,
		mission: "Other mission.",
	};
	const agent: Agent = {
		id: "orders",
		name: "Orders",
		role: "Fulfilment and tracking",
		tint: "#e7efff",
		on: true,
		autonomy: "Full auto",
		mission: "Ship every order.",
		targets: [["Fulfilment time", "2.1 days", "1 day"]],
		contribution: 72,
		tasks: 31,
		success: "98%",
		saved: "11.5h",
		last: "Added tracking",
		host: "vps-orders-01",
		region: "Frankfurt",
		size: "2 vCPU · 4 GB",
		cpu: "14%",
		uptime: "18 days",
		egress: ["shopify.com"],
		secrets: ["SHOPIFY_ORDERS_TOKEN"],
		kpis: [["Orders handled", "142"]],
		skills: [
			{ id: "shopify.fulfill_order", desc: "Mark items as shipped in Shopify", gate: "Auto", runs: 88, on: true },
		],
	};
	return {
		plans: [
			{ id: "Starter", name: "Starter", monthly: 49 },
			{ id: "Growth", name: "Growth", monthly: 149 },
			{ id: "Scale", name: "Scale", monthly: 399 },
		],
		images: [
			{
				id: "orders",
				name: "Orders",
				role: "Fulfilment and tracking",
				tint: "#e7efff",
				tag: "registry.agents.co/orders:1.8.2",
				version: "1.8.2",
				nextVersion: "1.8.3",
				updated: "2 days ago",
				updatedFull: "28 Oct 2026, 14:10",
				deployed: 31,
				onLatest: 29,
				status: "Stable",
				bugs: [
					{
						id: "B-412",
						sev: "Low",
						title: "Tracking sync skips orders with two parcels",
						age: "4 days",
						reports: 2,
					},
				],
				features: [{ id: "F-88", title: "Support for DHL Express tracking", votes: 14, stage: "Planned" }],
			},
		],
		accounts: [
			{
				account,
				agents: [agent],
				events: [
					{
						id: "e1041masterorders",
						time: "10:41",
						from: "master",
						to: "orders",
						kind: "Task",
						skill: "printify.get_shipment",
						text: "Check shipping for #A-1007",
						payload: { order: "A-1007" },
						writes: [],
						trace: traceFor("e1041masterorders"),
					},
				],
				store: { "policy.refund_auto_limit": 50 },
				rules: [
					{
						id: "r1",
						when: "a refund request comes in",
						agent: "support",
						action: "refund it if it is under the refund limit, otherwise ask me",
						approval: "Auto under limit",
						on: true,
					},
				],
				approvals: [
					{
						id: "ap1",
						agent: "support",
						title: "Refund $42 on #A-1012",
						detail: "Print arrived creased.",
						amount: "$42",
						status: "Pending",
					},
				],
				proposals: [
					{
						id: "mp-inventory",
						agent: "inventory",
						mission: "Never run out.",
						targets: [["Stock-outs", "0"]],
						status: "Proposed",
					},
				],
				revenue: [{ day: "2026-10-14", amount: 980 }],
				tiles: [{ label: "Revenue", value: "$8,420", delta: "+12% vs last week", deltaColor: "#00692a" }],
				messages: [{ id: "c1", from: "user", text: "Did the tracking go through?" }],
				masterName: "Master",
			},
			{
				account: second,
				agents: [],
				events: [],
				store: {},
				rules: [],
				approvals: [],
				proposals: [],
				revenue: [],
				tiles: null,
				messages: [],
				masterName: "Master",
			},
		],
	};
}
