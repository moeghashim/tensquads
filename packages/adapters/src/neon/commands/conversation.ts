import type { AccountScope, ConversationTransaction, Message, MessageFrom } from "@tensquads/domain";
import { requireScope } from "@tensquads/domain";
import { and, asc, eq, sql } from "drizzle-orm";

import { PENDING_TASK_WINDOW_MS } from "../../pending-window.ts";
import { workspaceTransaction } from "../lock.ts";
import type { AppDatabase } from "../postgres.ts";
import { agents, busEvents, messages, skills, stateEntries, threads } from "../schema.ts";
import { appendEvents, type BusCursor, lockCursor, saveCursor } from "./bus.ts";

export { PENDING_TASK_WINDOW_MS };

type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

const DOCK_THREAD = "dock";

function messageRank(id: string, sortOrder: number): number {
	const match = /^c(\d+)$/.exec(id);
	return match?.[1] ? Number(match[1]) : sortOrder;
}

export async function conversationTransaction<T>(
	db: AppDatabase,
	scope: AccountScope,
	work: (commands: ConversationTransaction) => Promise<T>,
): Promise<T> {
	const checked = requireScope(scope);
	if (checked.mode !== "account") throw new Error("A send needs an account.");
	const accountId = checked.accountId;
	const startedAt = new Date();
	return workspaceTransaction(db, async (tx) => {
		if (Date.now() - startedAt.getTime() >= PENDING_TASK_WINDOW_MS) {
			return { kind: "ignored" } as T;
		}
		await lockCursor(tx, accountId);
		return work({
			pendingTask: () => pendingTask(tx, accountId),
			agent: (id) => readAgent(tx, accountId, id),
			skills: (id) => readSkills(tx, accountId, id),
			store: () => readStore(tx, accountId),
			async message(from, text, agent) {
				const cursor = await lockCursor(tx, accountId);
				const written = await insertMessage(tx, accountId, cursor, from, text, agent ?? null);
				await saveCursor(tx, accountId, written.cursor);
			},
			messages: () => listMessages(tx, accountId),
			async appendEvent(draft) {
				const [event] = await appendEvents(tx, accountId, [draft], startedAt);
				if (!event) throw new Error("The event was not saved.");
				return event.id;
			},
			async completeAgent(id, text) {
				await tx
					.update(agents)
					.set({ tasks: sql`${agents.tasks} + 1`, lastText: text })
					.where(and(eq(agents.accountId, accountId), eq(agents.id, id)));
			},
		});
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
		threadId: DOCK_THREAD,
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
		.where(and(eq(threads.accountId, accountId), eq(threads.id, DOCK_THREAD)));
	if (rows.length > 0) {
		return;
	}
	await tx.insert(threads).values({ accountId, id: DOCK_THREAD, sortOrder: 0 });
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
	if (
		!latest ||
		latest.kind !== "Task" ||
		!isChatPayload(latest.payload) ||
		!latest.occurredAt ||
		Date.now() - latest.occurredAt.getTime() >= PENDING_TASK_WINDOW_MS
	) {
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
