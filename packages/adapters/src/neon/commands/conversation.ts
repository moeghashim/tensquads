import type { AccountScope, Message, MessageFrom, SendResult } from "@tensquads/domain";
import { requireScope } from "@tensquads/domain";
import { noAgentReply, pausedReply, resultFor, route, skillFor, taskPayload, workingReply } from "@tensquads/kernel";
import { and, asc, eq, sql } from "drizzle-orm";

import { workspaceTransaction } from "../lock.ts";
import type { AppDatabase } from "../postgres.ts";
import { agents, busEvents, messages, skills, stateEntries, threads } from "../schema.ts";
import { appendEvents, type BusCursor, lockCursor, saveCursor } from "./bus.ts";

type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

const MAIN_THREAD = "main";

export function messageRank(id: string, sortOrder: number): number {
	const match = /^c(\d+)$/.exec(id);
	return match?.[1] ? Number(match[1]) : sortOrder;
}

export async function beginSend(db: AppDatabase, scope: AccountScope, text: string): Promise<SendResult> {
	const checked = requireScope(scope);
	if (checked.mode !== "account") {
		return { kind: "ignored" };
	}
	const value = text.trim();
	if (value.length === 0) {
		return { kind: "ignored" };
	}
	return workspaceTransaction(db, async (tx) => {
		const cursor = await lockCursor(tx, checked.accountId);
		if (await pendingTask(tx, checked.accountId)) {
			return { kind: "ignored" };
		}
		const routed = route(value);
		const agent = routed ? await readAgent(tx, checked.accountId, routed) : null;
		const user = await insertMessage(tx, checked.accountId, cursor, "user", value, null);
		if (!agent) {
			const master = await insertMessage(tx, checked.accountId, user.cursor, "master", noAgentReply(), null);
			await saveCursor(tx, checked.accountId, master.cursor);
			return { kind: "answered", messages: await listMessages(tx, checked.accountId) };
		}
		if (!agent.isOn) {
			const master = await insertMessage(
				tx,
				checked.accountId,
				user.cursor,
				"master",
				pausedReply(agent.name),
				null,
			);
			await saveCursor(tx, checked.accountId, master.cursor);
			return { kind: "answered", messages: await listMessages(tx, checked.accountId) };
		}
		const skill = skillFor(await readSkills(tx, checked.accountId, agent.id));
		const master = await insertMessage(tx, checked.accountId, user.cursor, "master", workingReply(agent.name), null);
		await saveCursor(tx, checked.accountId, master.cursor);
		const store = await readStore(tx, checked.accountId);
		await appendEvents(tx, checked.accountId, [
			{
				from: "master",
				to: agent.id,
				kind: "Task",
				skill,
				text: value,
				payload: taskPayload(value, store),
			},
		]);
		return {
			kind: "working",
			agentId: agent.id,
			agentName: agent.name,
			skill,
			text: value,
			messages: await listMessages(tx, checked.accountId),
		};
	});
}

export async function finishSend(db: AppDatabase, scope: AccountScope): Promise<SendResult> {
	const checked = requireScope(scope);
	if (checked.mode !== "account") {
		return { kind: "ignored" };
	}
	return workspaceTransaction(db, async (tx) => {
		const cursor = await lockCursor(tx, checked.accountId);
		const pending = await pendingTask(tx, checked.accountId);
		if (!pending) {
			return { kind: "ignored" };
		}
		const planned = resultFor(pending.toAgent);
		if (!planned) {
			return { kind: "ignored" };
		}
		const written = await insertMessage(tx, checked.accountId, cursor, "agent", planned.text, pending.toAgent);
		await saveCursor(tx, checked.accountId, written.cursor);
		await appendEvents(tx, checked.accountId, [
			{
				from: pending.toAgent,
				to: "master",
				kind: "Result",
				skill: pending.skill,
				text: planned.text,
				payload: planned.payload,
				writes: planned.writes,
			},
		]);
		await tx
			.update(agents)
			.set({ tasks: sql`${agents.tasks} + 1`, lastText: planned.text })
			.where(and(eq(agents.accountId, checked.accountId), eq(agents.id, pending.toAgent)));
		return { kind: "replied", messages: await listMessages(tx, checked.accountId) };
	});
}

async function insertMessage(
	tx: Tx,
	accountId: string,
	cursor: BusCursor,
	from: MessageFrom,
	text: string,
	agent: string | null,
): Promise<{ readonly cursor: BusCursor }> {
	await ensureThread(tx, accountId);
	const seq = cursor.seq;
	await tx.insert(messages).values({
		accountId,
		threadId: MAIN_THREAD,
		id: `c${seq}`,
		fromRole: from,
		agent,
		body: text,
		sortOrder: seq,
	});
	return { cursor: { seq: seq + 1, clock: cursor.clock, scriptIndex: cursor.scriptIndex } };
}

async function ensureThread(tx: Tx, accountId: string): Promise<void> {
	const rows = await tx
		.select({ id: threads.id })
		.from(threads)
		.where(and(eq(threads.accountId, accountId), eq(threads.id, MAIN_THREAD)));
	if (rows.length > 0) {
		return;
	}
	await tx.insert(threads).values({ accountId, id: MAIN_THREAD, sortOrder: 0 });
}

async function readAgent(tx: Tx, accountId: string, agentId: string) {
	const rows = await tx
		.select({ id: agents.id, name: agents.name, isOn: agents.isOn })
		.from(agents)
		.where(and(eq(agents.accountId, accountId), eq(agents.id, agentId)));
	return rows[0] ?? null;
}

async function readSkills(tx: Tx, accountId: string, agentId: string) {
	const rows = await tx
		.select({ id: skills.id, on: skills.isOn })
		.from(skills)
		.where(and(eq(skills.accountId, accountId), eq(skills.agentId, agentId)))
		.orderBy(asc(skills.sortOrder));
	return rows;
}

async function readStore(tx: Tx, accountId: string): Promise<Record<string, unknown>> {
	const rows = await tx.select().from(stateEntries).where(eq(stateEntries.accountId, accountId));
	const store: Record<string, unknown> = {};
	for (const row of rows) {
		store[row.key] = JSON.parse(row.value) as unknown;
	}
	return store;
}

async function pendingTask(tx: Tx, accountId: string) {
	const rows = await tx.select().from(busEvents).where(eq(busEvents.accountId, accountId));
	const generated = rows.filter((row) => /^e\d+$/.test(row.id)).sort((left, right) => right.seq - left.seq);
	const latest = generated[0];
	if (!latest || latest.kind !== "Task" || !isChatPayload(latest.payload)) {
		return null;
	}
	return latest;
}

function isChatPayload(payload: unknown): boolean {
	return typeof payload === "object" && payload !== null && "from" in payload && payload.from === "chat";
}

export async function listMessages(tx: Tx | AppDatabase, accountId: string): Promise<readonly Message[]> {
	const rows = await tx.select().from(messages).where(eq(messages.accountId, accountId));
	return rows
		.slice()
		.sort(
			(left, right) =>
				messageRank(left.id, left.sortOrder) - messageRank(right.id, right.sortOrder) ||
				left.sortOrder - right.sortOrder,
		)
		.map((row) => ({
			id: row.id,
			from: asFrom(row.fromRole),
			...(row.agent ? { agent: row.agent } : {}),
			text: row.body,
		}));
}

function asFrom(value: string): MessageFrom {
	if (value === "user" || value === "master" || value === "agent") {
		return value;
	}
	throw new Error("Unknown message from.");
}
