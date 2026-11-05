import type { AccountScope, ConversationTransaction, Message, MessageFrom, PendingChatTask } from "@tensquads/domain";
import { chatTaskLink, requireScope } from "@tensquads/domain";
import { and, asc, eq, sql } from "drizzle-orm";

import { PENDING_TASK_WINDOW_MS } from "../../pending-window.ts";
import { workspaceTransaction } from "../lock.ts";
import type { AppDatabase } from "../postgres.ts";
import { agents, busEvents, messages, skills, stateEntries, threads } from "../schema.ts";
import { shownAgentName } from "../shown-name.ts";
import { appendEvents, type BusCursor, lockCursor, saveCursor } from "./bus.ts";

export { PENDING_TASK_WINDOW_MS };

type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];
type BusRow = typeof busEvents.$inferSelect;

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
	return workspaceTransaction(
		db,
		async (tx, constrainDeadline) => {
			await lockCursor(tx, accountId);
			return work({
				pendingTask: (taskId) => pendingTask(tx, accountId, constrainDeadline, taskId),
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
					return { id: event.id, time: event.time };
				},
				async completeAgent(id, text) {
					await tx
						.update(agents)
						.set({ tasks: sql`${agents.tasks} + 1`, lastText: text })
						.where(and(eq(agents.accountId, accountId), eq(agents.id, id)));
				},
			});
		},
		{ deadlineMs: PENDING_TASK_WINDOW_MS, accountId },
	);
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
	const row = rows[0];
	if (!row) return null;
	return { ...row, name: shownAgentName(row.id, row.name) };
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

async function pendingTask(
	tx: Tx,
	accountId: string,
	constrainDeadline: (absoluteMs: number) => void,
	taskId?: string,
): Promise<PendingChatTask | null> {
	if (taskId !== undefined) {
		return lockedChatTask(tx, accountId, taskId, constrainDeadline);
	}
	const rows = await tx.select().from(busEvents).where(eq(busEvents.accountId, accountId)).orderBy(asc(busEvents.seq));
	const linked = linkedTaskIds(rows);
	for (const row of rows) {
		const pending = unclosedChat(row, linked, constrainDeadline);
		if (pending) return pending;
	}
	return null;
}

async function lockedChatTask(
	tx: Tx,
	accountId: string,
	taskId: string,
	constrainDeadline: (absoluteMs: number) => void,
): Promise<PendingChatTask | null> {
	const rows = await tx
		.select()
		.from(busEvents)
		.where(and(eq(busEvents.accountId, accountId), eq(busEvents.id, taskId)))
		.for("update");
	const row = rows[0];
	if (!row) return null;
	const results = await tx
		.select()
		.from(busEvents)
		.where(and(eq(busEvents.accountId, accountId), eq(busEvents.kind, "Result")));
	return unclosedChat(row, linkedTaskIds(results), constrainDeadline);
}

function linkedTaskIds(rows: readonly BusRow[]): Set<string> {
	const linked = new Set<string>();
	for (const row of rows) {
		if (row.kind !== "Result") continue;
		const task = taskLink(row.payload);
		if (task) linked.add(task);
	}
	return linked;
}

function unclosedChat(
	row: BusRow,
	linked: ReadonlySet<string>,
	constrainDeadline: (absoluteMs: number) => void,
): PendingChatTask | null {
	if (row.kind !== "Task" || !isChatPayload(row.payload) || row.occurredAt === null || linked.has(row.id)) {
		return null;
	}
	const opened = row.occurredAt.getTime();
	if (Date.now() - opened >= PENDING_TASK_WINDOW_MS) return null;
	constrainDeadline(opened + PENDING_TASK_WINDOW_MS);
	return { id: row.id, toAgent: row.toAgent, skill: row.skill };
}

function taskLink(payload: unknown): string | null {
	if (typeof payload !== "object" || payload === null || !(chatTaskLink in payload)) return null;
	const value = payload[chatTaskLink];
	return typeof value === "string" && value.length > 0 ? value : null;
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
