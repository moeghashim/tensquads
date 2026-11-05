import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "@neondatabase/serverless";
import type { PublishedEvent } from "@tensquads/kernel";

import { writePending } from "../src/cloudflare-bus/neon-write.ts";
import { createRepositories } from "../src/neon/repositories.ts";
import { agents, machines } from "../src/neon/schema.ts";
import { openPglite } from "./pglite.ts";

const accountId = "inbox-proof";
const scope = { accountId, mode: "account" as const };
const url = "postgres://fixture/db";

function ask(id: string, text: string, payload: PublishedEvent["payload"]): PublishedEvent {
	return {
		id,
		from: "master",
		to: "user",
		kind: "Approval",
		skill: text.startsWith("Publish") ? "approval.ask" : "brief.write",
		text,
		payload,
		writes: [],
	};
}

const brief = ask("m-01", "Build the site with this brief?", {
	brief: { text: "Serve lunch.", gap: "No lunch page." },
});
const publish = ask("m-02", "Publish the site?", { previewUrl: "https://preview.example/page" });
const yes: PublishedEvent = {
	id: "m-03",
	from: "master",
	to: "website",
	kind: "Approval",
	skill: "approval.ask",
	text: "The user said yes.",
	payload: {},
	writes: [],
};

function routePool(t: test.TestContext, database: Awaited<ReturnType<typeof openPglite>>) {
	t.mock.method(Pool.prototype, "query", async (config: { text: string; rowMode?: string }, params: unknown[]) => {
		const result = await database.client.query<Record<string, unknown>>(config.text, params);
		const rows = config.rowMode === "array" ? result.rows.map((row) => Object.values(row)) : result.rows;
		return { ...result, rows };
	});
	t.mock.method(Pool.prototype, "connect", async () => ({
		query: (config: { text: string }, params: unknown[]) => database.client.query(config.text, params),
		release() {},
	}));
}

async function account(database: Awaited<ReturnType<typeof openPglite>>) {
	await database.client.query(
		`INSERT INTO accounts (id, account_id, name, owner, email, tint, agents, online, tasks, last_active, created_week, mission, sort_order) VALUES ($1, $1, '', 'Moe', '', '', 0, 0, 0, '', 0, '', 0)`,
		[accountId],
	);
}

async function website(database: Awaited<ReturnType<typeof openPglite>>) {
	await database.db.insert(agents).values({
		accountId,
		id: "website",
		name: "Website builder",
		role: "Website builder",
		tint: "#e5e9f0",
		isOn: true,
		autonomy: "Ask first",
		mission: "Build one page from the brief.",
		contribution: 0,
		tasks: 0,
		success: "0%",
		saved: "0h",
		lastText: "",
		targets: [["Pages", "0", "1"]],
		kpis: [["Tasks", "0"]],
		sortOrder: 1,
	});
	await database.db.insert(machines).values({
		accountId,
		agentId: "website",
		host: "proof-website",
		region: "Frankfurt",
		size: "2 vCPU · 4 GB",
		cpu: "0%",
		uptime: "Just started",
		egress: [],
		secrets: [],
		sortOrder: 1,
	});
}

test("the master commit writes both asks into the inbox", async (t) => {
	const database = await openPglite();
	routePool(t, database);
	try {
		await account(database);
		await writePending(url, accountId, [
			{ seq: 1, event: brief },
			{ seq: 2, event: publish },
			{ seq: 3, event: yes },
		]);
		await website(database);
		const rows = (
			await database.client.query(
				"SELECT id, agent, title, detail, amount, status, sort_order FROM approvals ORDER BY sort_order",
			)
		).rows;
		assert.deepEqual(rows, [
			{
				id: "m-01",
				agent: "website",
				title: "Build the site with this brief?",
				detail: "Serve lunch.",
				amount: "",
				status: "Pending",
				sort_order: 1,
			},
			{
				id: "m-02",
				agent: "website",
				title: "Publish the site?",
				detail: "https://preview.example/page",
				amount: "",
				status: "Pending",
				sort_order: 2,
			},
		]);
		const bag = createRepositories(database.db);
		const inbox = await bag.policy.inbox(scope);
		const listed = await bag.squads.listAgents(scope);
		const byId = new Map(listed.map((agent) => [agent.id, agent]));
		assert.deepEqual(
			inbox.approvals.map((item) => item.title),
			["Build the site with this brief?", "Publish the site?"],
		);
		for (const item of inbox.approvals) assert.ok(byId.get(item.agent));
		assert.equal(inbox.count, 2);
	} finally {
		await database.close();
	}
});

test("a replay does not reset a decided ask", async (t) => {
	const database = await openPglite();
	routePool(t, database);
	try {
		await account(database);
		await writePending(url, accountId, [{ seq: 1, event: brief }]);
		await database.client.query("UPDATE approvals SET status = 'Approved' WHERE id = 'm-01'");
		await writePending(url, accountId, [{ seq: 1, event: brief }]);
		const rows = (await database.client.query("SELECT id, status FROM approvals")).rows;
		assert.deepEqual(rows, [{ id: "m-01", status: "Approved" }]);
	} finally {
		await database.close();
	}
});

test("a failed sibling rolls the ask back with the bus event", async (t) => {
	const database = await openPglite();
	routePool(t, database);
	try {
		await account(database);
		await writePending(url, accountId, [{ seq: 1, event: brief }]);
		await assert.rejects(
			writePending(url, accountId, [
				{ seq: 2, event: { ...publish, id: "m-04" } },
				{ seq: 3, event: { ...yes, id: "m-05", set: { invalid: 1n } } },
			]),
		);
		assert.deepEqual((await database.client.query("SELECT id FROM approvals ORDER BY id")).rows, [{ id: "m-01" }]);
		assert.deepEqual((await database.client.query("SELECT id FROM bus_events ORDER BY seq")).rows, [{ id: "m-01" }]);
	} finally {
		await database.close();
	}
});
