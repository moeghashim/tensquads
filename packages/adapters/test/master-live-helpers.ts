import type test from "node:test";
import { Pool } from "@neondatabase/serverless";
import type { PublishedEvent } from "@tensquads/kernel";
import { replaceDemoAccount } from "../../seed/src/demo-account.ts";
import type { AccountBus } from "../src/cloudflare-bus/account-bus.ts";
import { schema } from "../src/neon/schema.ts";
import { Storage } from "./bus-storage.ts";
import { openPglite } from "./pglite.ts";

export const url = "postgres://fixture/live-run";

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

export function reportEvent(id: string, report: unknown): PublishedEvent {
	return {
		id,
		time: "12:02",
		from: "market",
		to: "master",
		kind: "Result",
		skill: "report.write",
		text: "The report, the sources, and the evidence.",
		payload: { report },
		writes: [],
		trace: `tr_${id}`,
	};
}

export function userYes(id: string): PublishedEvent {
	return {
		id,
		time: "12:03",
		from: "user",
		to: "master",
		kind: "Approval",
		skill: "brief.write",
		text: "Yes.",
		payload: {},
		writes: [],
		trace: `tr_${id}`,
	};
}

export async function storedEvents(storage: Storage): Promise<PublishedEvent[]> {
	const rows = await storage.list<PublishedEvent>({ prefix: "event:" });
	return [...rows.entries()]
		.sort((left, right) => left[0].localeCompare(right[0], "en", { numeric: true }))
		.map(([, event]) => event);
}

export async function bus(
	t: test.TestContext,
	accountId: string,
	clerkUserId: string,
	request: unknown,
	taskId: string,
) {
	const database = await openPglite();
	routePool(t, database);
	await replaceDemoAccount(database.db, accountId, clerkUserId);
	await database.db.insert(schema.agents).values({
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
		sortOrder: 9,
	});
	const storage = new Storage();
	await storage.put("account", accountId);
	await storage.put("seq", 1);
	await storage.put("state:business", JSON.stringify(request));
	await storage.put("event:1", {
		id: taskId,
		time: "12:01",
		from: "master",
		to: "market",
		kind: "Task",
		skill: "task.route",
		text: "Research this business.",
		payload: {
			businessName: (request as { businessName: string }).businessName,
			businessType: (request as { businessType: string }).businessType,
			items: (request as { items: unknown }).items,
			cuisine: (request as { cuisine?: string }).cuisine,
		},
		writes: ["business"],
		trace: `tr_${taskId}`,
	});
	return { database, storage };
}

export function post(target: AccountBus, accountId: string, event: PublishedEvent): Promise<Response> {
	return target.fetch(
		new Request("https://bus/accept", {
			method: "POST",
			body: JSON.stringify({ accountId, event }),
		}),
	);
}
