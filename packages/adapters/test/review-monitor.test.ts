import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "@neondatabase/serverless";

import { AccountBus } from "../src/cloudflare-bus/account-bus.ts";
import { hmacSign } from "../src/cloudflare-bus/hmac.ts";
import { credentialForMachine, handleMachineRequest, type WorkerBindings } from "../src/cloudflare-bus/http.ts";
import { recordMonitor, resolveMonitor } from "../src/cloudflare-bus/monitors.ts";
import { workerTestBus } from "../src/worker-adapters.ts";
import { Storage } from "./bus-storage.ts";
import { openPglite } from "./pglite.ts";

const KEY = "machine-token-fixture";
const now = 1_800_000_000_000;
const url = "postgres://fixture/db";

function routePool(t: test.TestContext, database: Awaited<ReturnType<typeof openPglite>>) {
	const query = async (config: { text: string; rowMode?: string } | string, params?: unknown[]) => {
		if (typeof config === "string") return database.client.query(config, params);
		const result = await database.client.query<Record<string, unknown>>(config.text, params);
		const rows = config.rowMode === "array" ? result.rows.map((row) => Object.values(row)) : result.rows;
		return { ...result, rows };
	};
	t.mock.method(Pool.prototype, "query", query);
	t.mock.method(Pool.prototype, "connect", async () => ({
		query,
		release() {},
	}));
}

async function seedAccount(database: Awaited<ReturnType<typeof openPglite>>, accountId: string) {
	await database.client.query(
		`INSERT INTO accounts (id, account_id, name, owner, email, tint, agents, online, tasks, last_active, created_week, mission, sort_order) VALUES ($1, $1, '', 'Moe', '', '', 0, 0, 0, '', 0, '', 0)`,
		[accountId],
	);
	await database.client.query(
		`INSERT INTO agents (account_id, id, name, role, tint, is_on, autonomy, mission, contribution, tasks, success, saved, last_text, targets, kpis, sort_order) VALUES ($1, 'market', 'Market researcher', 'Market researcher', '', true, 'Ask first', '', 0, 0, '0%', '0h', '', '[]', '[]', 1)`,
		[accountId],
	);
	await database.client.query(
		`INSERT INTO agents (account_id, id, name, role, tint, is_on, autonomy, mission, contribution, tasks, success, saved, last_text, targets, kpis, sort_order) VALUES ($1, 'website', 'Website builder', 'Website builder', '', true, 'Ask first', '', 0, 0, '0%', '0h', '', '[]', '[]', 2)`,
		[accountId],
	);
}

async function storeMonitor(
	env: WorkerBindings,
	accountId: string,
	agentId: string,
	monitorId: string,
	secret: string,
	tokenAccount = accountId,
	tokenAgent = agentId,
): Promise<Response | null> {
	const delivery = await credentialForMachine({ MACHINE_TOKEN_KEY: KEY }, tokenAccount, tokenAgent, now);
	return handleMachineRequest(
		new Request("https://worker/machine/monitor", {
			method: "POST",
			headers: { authorization: delivery.authorization },
			body: JSON.stringify({ accountId, agentId, monitorId, secret }),
		}),
		env,
	);
}

async function postChange(
	env: WorkerBindings,
	account: string | undefined,
	monitorId: string,
	secret: string,
	eventId = `cross-${monitorId}`,
) {
	const stamp = String(now / 1000);
	const body = JSON.stringify({
		id: eventId,
		event: "change.detected",
		created_at: new Date(now).toISOString(),
		data: {
			change: {
				monitor_id: monitorId,
				url: "https://example.com",
				title: "price",
				summary: "changed",
			},
		},
	});
	const sig = Buffer.from(await hmacSign(secret, `${stamp}.${body}`)).toString("hex");
	const query = account === undefined ? "" : `?account=${account}`;
	return handleMachineRequest(
		new Request(`https://worker/change.detected${query}`, {
			method: "POST",
			headers: {
				"x-context-signature": `t=${stamp},v1=${sig}`,
				"x-context-event": "change.detected",
			},
			body,
		}),
		env,
	);
}

async function count(accountId: string): Promise<number> {
	return (await workerTestBus().events({ accountId, mode: "account" })).length;
}

test("a stored secret verifies", async (t) => {
	const database = await openPglite();
	routePool(t, database);
	try {
		await seedAccount(database, "acct-verify");
		const env: WorkerBindings = { MACHINE_TOKEN_KEY: KEY, DATABASE_URL: url, now: () => now };
		const saved = await storeMonitor(env, "acct-verify", "market", "mon-verify", "secret-verify-1");
		assert.equal(saved?.status, 200);
		assert.deepEqual(await saved?.json(), { ok: true });

		const ok = await postChange(env, "acct-verify", "mon-verify", "secret-verify-1");
		assert.equal(ok?.status, 200);
		assert.deepEqual(await ok?.json(), { ok: true });
		assert.equal(await count("acct-verify"), 1);

		const omitted = await postChange(env, undefined, "mon-verify", "secret-verify-1");
		assert.equal(omitted?.status, 200);
		assert.deepEqual(await omitted?.json(), { ok: true, seen: true });
	} finally {
		await database.close();
	}
});

test("an unknown monitor still checks the signature", async (t) => {
	const database = await openPglite();
	routePool(t, database);
	let signs = 0;
	const sign = crypto.subtle.sign.bind(crypto.subtle);
	t.mock.method(crypto.subtle, "sign", async (...args: Parameters<typeof crypto.subtle.sign>) => {
		signs += 1;
		return sign(...args);
	});
	try {
		await seedAccount(database, "acct-hmac");
		const env: WorkerBindings = { MACHINE_TOKEN_KEY: KEY, DATABASE_URL: url, now: () => now };
		const unknown = await postChange(env, "acct-hmac", "mon-missing", "secret-right");
		assert.equal(unknown?.status, 400);
		assert.equal(await unknown?.text(), "The message was rejected.");
		assert.equal(signs >= 2, true);
	} finally {
		await database.close();
	}
});

test("a wrong secret is rejected", async (t) => {
	const database = await openPglite();
	routePool(t, database);
	try {
		await seedAccount(database, "acct-wrong");
		const env: WorkerBindings = { MACHINE_TOKEN_KEY: KEY, DATABASE_URL: url, now: () => now };
		assert.equal((await storeMonitor(env, "acct-wrong", "market", "mon-wrong", "secret-right"))?.status, 200);

		const wrong = await postChange(env, "acct-wrong", "mon-wrong", "secret-wrong");
		assert.equal(wrong?.status, 400);
		assert.equal(await wrong?.text(), "The message was rejected.");

		const unknown = await postChange(env, "acct-wrong", "mon-unknown", "secret-right");
		assert.equal(unknown?.status, 400);
		assert.equal(await unknown?.text(), "The message was rejected.");

		const mismatch = await postChange(env, "other-account", "mon-wrong", "secret-right");
		assert.equal(mismatch?.status, 400);
		assert.equal(await mismatch?.text(), "The message was rejected.");
		assert.equal(await count("acct-wrong"), 0);
	} finally {
		await database.close();
	}
});

test("monitor A's secret cannot verify monitor B", async (t) => {
	const database = await openPglite();
	routePool(t, database);
	try {
		await seedAccount(database, "acct-pair");
		const env: WorkerBindings = { MACHINE_TOKEN_KEY: KEY, DATABASE_URL: url, now: () => now };
		assert.equal((await storeMonitor(env, "acct-pair", "market", "mon-a", "secret-a"))?.status, 200);
		assert.equal((await storeMonitor(env, "acct-pair", "market", "mon-b", "secret-b"))?.status, 200);

		const cross = await postChange(env, "acct-pair", "mon-b", "secret-a");
		assert.equal(cross?.status, 400);
		assert.equal(await cross?.text(), "The message was rejected.");
		assert.equal(await count("acct-pair"), 0);

		const direct = await postChange(env, "acct-pair", "mon-b", "secret-b");
		assert.equal(direct?.status, 200);
		assert.equal(await count("acct-pair"), 1);
	} finally {
		await database.close();
	}
});

test("another account's agent cannot store a secret", async (t) => {
	const database = await openPglite();
	routePool(t, database);
	try {
		await seedAccount(database, "acct-one");
		await seedAccount(database, "acct-two");
		const env: WorkerBindings = { MACHINE_TOKEN_KEY: KEY, DATABASE_URL: url, now: () => now };
		const badToken = await storeMonitor(env, "acct-one", "market", "mon-owned", "secret-one", "acct-two", "market");
		assert.equal(badToken?.status, 401);

		assert.equal((await storeMonitor(env, "acct-one", "market", "mon-owned", "secret-one"))?.status, 200);
		const stolen = await storeMonitor(env, "acct-two", "market", "mon-owned", "secret-two");
		assert.equal(stolen?.status, 400);
		assert.equal(await stolen?.text(), "The message was rejected.");

		const forged = await postChange(env, "acct-two", "mon-owned", "secret-two");
		assert.equal(forged?.status, 400);
		assert.equal(await count("acct-two"), 0);

		const intact = await postChange(env, "acct-one", "mon-owned", "secret-one");
		assert.equal(intact?.status, 200);
		assert.equal(await count("acct-one"), 1);
	} finally {
		await database.close();
	}
});

test("a non-researcher agent cannot store a secret", async (t) => {
	const database = await openPglite();
	routePool(t, database);
	try {
		await seedAccount(database, "acct-role");
		const env: WorkerBindings = { MACHINE_TOKEN_KEY: KEY, DATABASE_URL: url, now: () => now };
		const denied = await storeMonitor(env, "acct-role", "website", "mon-role", "secret-role");
		assert.equal(denied?.status, 400);
		assert.equal(await denied?.text(), "The message was rejected.");

		const unstored = await postChange(env, "acct-role", "mon-role", "secret-role");
		assert.equal(unstored?.status, 400);
		assert.equal(await count("acct-role"), 0);
	} finally {
		await database.close();
	}
});

test("a replaced secret makes the old one fail", async (t) => {
	const database = await openPglite();
	routePool(t, database);
	try {
		await seedAccount(database, "acct-rotate");
		const env: WorkerBindings = { MACHINE_TOKEN_KEY: KEY, DATABASE_URL: url, now: () => now };
		assert.equal((await storeMonitor(env, "acct-rotate", "market", "mon-rot", "secret-old"))?.status, 200);
		assert.equal((await storeMonitor(env, "acct-rotate", "market", "mon-rot", "secret-new"))?.status, 200);

		const oldTry = await postChange(env, "acct-rotate", "mon-rot", "secret-old", "evt-old");
		assert.equal(oldTry?.status, 400);
		assert.equal(await count("acct-rotate"), 0);

		const newTry = await postChange(env, "acct-rotate", "mon-rot", "secret-new", "evt-new");
		assert.equal(newTry?.status, 200);
		assert.equal(await count("acct-rotate"), 1);
	} finally {
		await database.close();
	}
});

test("the secret appears in no response body, event or log", async (t) => {
	const database = await openPglite();
	routePool(t, database);
	const logs: string[] = [];
	const capture = (...args: unknown[]) => {
		logs.push(args.map((item) => String(item)).join(" "));
	};
	t.mock.method(console, "log", capture);
	t.mock.method(console, "error", capture);
	t.mock.method(console, "warn", capture);
	t.mock.method(console, "info", capture);
	try {
		await seedAccount(database, "acct-quiet");
		const secret = "whsec_never_shown_anywhere_987654";
		const env: WorkerBindings = { MACHINE_TOKEN_KEY: KEY, DATABASE_URL: url, now: () => now };
		const saved = await storeMonitor(env, "acct-quiet", "market", "mon-quiet", secret);
		const savedText = await saved?.text();
		assert.equal(savedText, JSON.stringify({ ok: true }));
		assert.equal(savedText?.includes(secret), false);

		const ok = await postChange(env, "acct-quiet", "mon-quiet", secret, "evt-quiet");
		const okText = await ok?.text();
		assert.equal(okText?.includes(secret), false);

		const bad = await postChange(env, "acct-quiet", "mon-quiet", "wrong-secret", "evt-bad");
		const badText = await bad?.text();
		assert.equal(badText?.includes(secret), false);

		const events = await workerTestBus().events({ accountId: "acct-quiet", mode: "account" });
		assert.equal(events.length, 1);
		assert.equal(JSON.stringify(events).includes(secret), false);
		assert.equal(logs.join("\n").includes(secret), false);
	} finally {
		await database.close();
	}
});

test("a real bus keeps the monitor on the account that recorded it", async () => {
	const storage = new Storage();
	const target = new AccountBus({ storage, acceptWebSocket() {}, getWebSockets: () => [] }, {});
	const namespace = {
		idFromName: (name: string) => name,
		get: () => ({
			fetch(input: Request | string | URL, init?: RequestInit) {
				return target.fetch(new Request(input, init));
			},
		}),
	};
	const env = { ADAPTERS: "real", ACCOUNT_BUS: namespace };
	await recordMonitor("monitor-bus", "bus-account", env);
	assert.equal(await resolveMonitor("monitor-bus", env), "bus-account");
	assert.equal(await resolveMonitor("monitor-missing", env), null);
	await assert.rejects(
		() => recordMonitor("monitor-bus", "other-account", env),
		/The monitor belongs to another account\./,
	);
});
