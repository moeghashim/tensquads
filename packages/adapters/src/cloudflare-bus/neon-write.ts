import { neonConfig, Pool } from "@neondatabase/serverless";
import { BRIEF_FAILED_TEXT, NO_FINDING_TEXT, NO_ITEMS_TEXT, NO_NAME_TEXT } from "@tensquads/domain";
import type { PublishedEvent } from "@tensquads/kernel";
import { and, asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { chooseAdapters } from "../adapter-choice.ts";
import { retryApprovalDeliveries } from "../neon/commands/approval-delivery.ts";
import { askAgent, askDetail, watchAsk } from "../neon/commands/master-ask.ts";
import type { AppDatabase } from "../neon/postgres.ts";
import {
	approvalDeliveries,
	approvals,
	busEvents,
	messages,
	schema,
	skills,
	stateEntries,
	threads,
} from "../neon/schema.ts";
import { traceFor } from "../trace.ts";

const directWrite = "A bus write in real mode must go through the Durable Object.";

type Thenable = PromiseLike<unknown>;

interface InsertChain extends Thenable {
	onConflictDoNothing(): Thenable;
	onConflictDoUpdate(config: { target: unknown; set: Record<string, unknown> }): Thenable;
}

interface DeleteChain extends Thenable {
	where(condition: unknown): Thenable;
}

interface BusTableTx {
	insert(table: typeof busEvents | typeof stateEntries): { values(values: unknown): InsertChain };
	delete(table: typeof busEvents | typeof stateEntries): DeleteChain;
}

export function refuseDirectBusWrite(): void {
	if (chooseAdapters(process.env.ADAPTERS) === "real") throw new Error(directWrite);
}

function writer(tx: unknown): BusTableTx {
	return tx as BusTableTx;
}

export async function insertBusEvent(tx: unknown, row: Record<string, unknown>): Promise<void> {
	refuseDirectBusWrite();
	await writer(tx).insert(busEvents).values(row);
}

export async function insertBusEvents(tx: unknown, rows: readonly Record<string, unknown>[]): Promise<void> {
	refuseDirectBusWrite();
	await writer(tx).insert(busEvents).values(rows);
}

export async function upsertStateValue(
	tx: unknown,
	row: { accountId: string; key: string; value: string; sortOrder: number },
): Promise<void> {
	refuseDirectBusWrite();
	await writer(tx)
		.insert(stateEntries)
		.values(row)
		.onConflictDoUpdate({
			target: [stateEntries.accountId, stateEntries.key],
			set: { value: row.value },
		});
}

export async function insertStateRows(tx: unknown, rows: readonly Record<string, unknown>[]): Promise<void> {
	refuseDirectBusWrite();
	await writer(tx).insert(stateEntries).values(rows);
}

// A new account has no Durable Object yet, so its first state rows are seeded here.
// Call it only inside the transaction that creates the account.
export async function seedNewAccountStateRows(tx: unknown, rows: readonly Record<string, unknown>[]): Promise<void> {
	await writer(tx).insert(stateEntries).values(rows);
}

export async function deleteAllBusEvents(tx: unknown): Promise<void> {
	refuseDirectBusWrite();
	await writer(tx).delete(busEvents);
}

export async function deleteAllStateEntries(tx: unknown): Promise<void> {
	refuseDirectBusWrite();
	await writer(tx).delete(stateEntries);
}

export async function deleteAccountBusEvents(tx: unknown, accountId: string): Promise<void> {
	refuseDirectBusWrite();
	await writer(tx).delete(busEvents).where(eq(busEvents.accountId, accountId));
}

export async function deleteAccountStateEntries(tx: unknown, accountId: string): Promise<void> {
	refuseDirectBusWrite();
	await writer(tx).delete(stateEntries).where(eq(stateEntries.accountId, accountId));
}

export interface PendingBusRow {
	readonly seq: number;
	readonly event: PublishedEvent;
}

function sockets(): void {
	const socket = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
	if (socket) neonConfig.webSocketConstructor = socket;
}

function describe(error: unknown): string {
	const parts: string[] = [];
	let current: unknown = error;
	for (let depth = 0; current && depth < 6; depth += 1) {
		if (typeof current !== "object") {
			parts.push(String(current));
			break;
		}
		const record = current as { message?: unknown; code?: unknown; cause?: unknown };
		const code = typeof record.code === "string" ? record.code : "";
		const message = typeof record.message === "string" ? record.message : "";
		const line = `${code} ${message}`.trim();
		if (line.length > 0) parts.push(line);
		current = record.cause;
	}
	return parts.join(" | ") || "The bus write failed.";
}

function hidden(error: unknown, connectionString: string): Error {
	let message = describe(error).split(connectionString).join("redacted");
	try {
		const password = new URL(connectionString).password;
		if (password.length > 0) message = message.split(decodeURIComponent(password)).join("redacted");
	} catch {
		return new Error(message);
	}
	return new Error(message);
}

function database(connectionString: string) {
	sockets();
	const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 2_000 });
	return { pool, db: drizzle(pool, { schema }) };
}

// No module-wide queue. One isolate can hold several account objects, and a
// call for one account must not wait on another. Order inside one account
// comes from the object queue in AccountBus. Each call opens its own pool.
async function withDatabase<T>(
	connectionString: string,
	run: (db: ReturnType<typeof database>["db"]) => Promise<T>,
): Promise<T> {
	const { pool, db } = database(connectionString);
	try {
		return await run(db);
	} finally {
		await pool.end();
	}
}

export async function withNeon<T>(
	connectionString: string,
	run: (db: ReturnType<typeof database>["db"]) => Promise<T>,
): Promise<T> {
	return withDatabase(connectionString, async (db) => {
		try {
			return await run(db);
		} catch (error) {
			throw hidden(error, connectionString);
		}
	});
}

// keeps each row's event id, so a repeat send is dropped at the receiver.
// The count left tells the alarm to run again.
export async function drainApprovalDeliveries(
	connectionString: string,
	accountId: string,
	deliver: (event: PublishedEvent) => Promise<void>,
	beforeMs?: number,
): Promise<number> {
	return withDatabase(connectionString, async (db) => {
		try {
			return await retryApprovalDeliveries(
				db as unknown as AppDatabase,
				accountId,
				(_id, event) => deliver(event as PublishedEvent),
				beforeMs,
			);
		} catch (error) {
			throw hidden(error, connectionString);
		}
	});
}

// The cron sweep finds accounts whose pending rows are older than the grace time.
export function readStaleDeliveryAccounts(connectionString: string, beforeMs: number): Promise<string[]> {
	return withDatabase(connectionString, async (db) => {
		try {
			const rows = await db
				.select({ accountId: approvalDeliveries.accountId, event: approvalDeliveries.event })
				.from(approvalDeliveries);
			const accounts = new Set<string>();
			for (const row of rows) {
				const parsed = Date.parse(row.event.time);
				if ((Number.isFinite(parsed) ? parsed : 0) <= beforeMs) accounts.add(row.accountId);
			}
			return [...accounts].sort();
		} catch (error) {
			throw hidden(error, connectionString);
		}
	});
}

export function writePending(
	connectionString: string,
	accountId: string,
	rows: readonly PendingBusRow[],
): Promise<void> {
	return withDatabase(connectionString, async (db) => {
		try {
			await db.transaction(async (txn) => {
				for (const row of rows) {
					const inserted = await txn
						.insert(busEvents)
						.values({
							accountId,
							id: row.event.id,
							timeText: row.event.time ?? "",
							occurredAt: null,
							fromAgent: row.event.from,
							toAgent: row.event.to,
							kind: row.event.kind,
							skill: row.event.skill,
							body: row.event.text,
							payload: { ...row.event.payload },
							writes: [...row.event.writes],
							trace: row.event.trace ?? traceFor(row.event.id),
							seq: row.seq,
						})
						.onConflictDoNothing()
						.returning({ id: busEvents.id });
					await writeState(txn, accountId, row.seq, row.event.set);
					await projectAsk(txn, accountId, row.seq, row.event);
					await insertWatch(txn, accountId, row.seq, row.event);
					await insertStopText(txn, accountId, row.seq, row.event);
					if (inserted.length === 0) continue;
					await countSkillRun(txn, accountId, row.event);
					await insertPreview(txn, accountId, row.seq, row.event);
				}
			});
		} catch (error) {
			throw hidden(error, connectionString);
		}
	});
}

const DOCK_THREAD = "dock";

function previewUrlOf(event: PublishedEvent): string {
	if (event.kind !== "Result" || event.skill !== "site.preview") return "";
	const url = event.payload.previewUrl;
	return typeof url === "string" ? url.trim() : "";
}

async function countSkillRun(
	db: Parameters<Parameters<ReturnType<typeof database>["db"]["transaction"]>[0]>[0],
	accountId: string,
	event: PublishedEvent,
): Promise<void> {
	if (event.kind !== "Result" || event.from === "master" || event.from === "user" || event.skill.length === 0) return;
	await db
		.update(skills)
		.set({ runs: sql`${skills.runs} + 1` })
		.where(and(eq(skills.accountId, accountId), eq(skills.agentId, event.from), eq(skills.id, event.skill)));
}

async function insertPreview(
	db: Parameters<Parameters<ReturnType<typeof database>["db"]["transaction"]>[0]>[0],
	accountId: string,
	seq: number,
	event: PublishedEvent,
): Promise<void> {
	const url = previewUrlOf(event);
	if (url.length === 0) return;
	await db.insert(threads).values({ accountId, id: DOCK_THREAD, sortOrder: 0 }).onConflictDoNothing();
	await db
		.insert(messages)
		.values({
			accountId,
			threadId: DOCK_THREAD,
			id: `preview-${event.id}`,
			fromRole: "master",
			agent: null,
			body: `The site preview is ${url}`,
			sortOrder: seq,
		})
		.onConflictDoNothing();
}

async function projectAsk(
	db: Parameters<Parameters<ReturnType<typeof database>["db"]["transaction"]>[0]>[0],
	accountId: string,
	seq: number,
	event: PublishedEvent,
): Promise<void> {
	const detail = askDetail(event);
	if (detail === null) return;
	await db
		.insert(approvals)
		.values({
			accountId,
			id: event.id,
			agent: askAgent(event.text),
			title: event.text,
			detail,
			amount: "",
			status: "Pending",
			sortOrder: seq,
		})
		.onConflictDoNothing();
}

// These stop messages go to the owner chat.
const STOP_TEXTS: readonly string[] = [NO_ITEMS_TEXT, NO_FINDING_TEXT, NO_NAME_TEXT, BRIEF_FAILED_TEXT];

async function insertStopText(
	db: Parameters<Parameters<ReturnType<typeof database>["db"]["transaction"]>[0]>[0],
	accountId: string,
	seq: number,
	event: PublishedEvent,
): Promise<void> {
	if (event.kind !== "Escalation" || event.from !== "master" || !STOP_TEXTS.includes(event.text)) return;
	await db.insert(threads).values({ accountId, id: DOCK_THREAD, sortOrder: 0 }).onConflictDoNothing();
	await db
		.insert(messages)
		.values({
			accountId,
			threadId: DOCK_THREAD,
			id: `items-${event.id}`,
			fromRole: "master",
			agent: null,
			body: event.text,
			sortOrder: seq,
		})
		.onConflictDoNothing();
}

async function insertWatch(
	db: Parameters<Parameters<ReturnType<typeof database>["db"]["transaction"]>[0]>[0],
	accountId: string,
	seq: number,
	event: PublishedEvent,
): Promise<void> {
	if (event.kind !== "Approval" || event.from !== "master" || event.to !== "user" || event.text !== watchAsk) return;
	await db.insert(threads).values({ accountId, id: DOCK_THREAD, sortOrder: 0 }).onConflictDoNothing();
	await db
		.insert(messages)
		.values({
			accountId,
			threadId: DOCK_THREAD,
			id: `watch-${event.id}`,
			fromRole: "master",
			agent: null,
			body: event.text,
			sortOrder: seq,
		})
		.onConflictDoNothing();
}

async function writeState(
	db: Parameters<Parameters<ReturnType<typeof database>["db"]["transaction"]>[0]>[0],
	accountId: string,
	seq: number,
	values: Readonly<Record<string, unknown>> | undefined,
): Promise<void> {
	if (!values) return;
	for (const [key, value] of Object.entries(values)) {
		const stored = JSON.stringify(value);
		await db
			.insert(stateEntries)
			.values({ accountId, key, value: stored, sortOrder: seq })
			.onConflictDoUpdate({
				target: [stateEntries.accountId, stateEntries.key],
				set: { value: stored, sortOrder: seq },
			});
	}
}

export async function readBusEvents(connectionString: string, accountId: string): Promise<PublishedEvent[]> {
	return (await readBusHistory(connectionString, accountId)).map((row) => row.event);
}

export function readBusHistory(connectionString: string, accountId: string): Promise<PendingBusRow[]> {
	return withDatabase(connectionString, async (db) => {
		try {
			const rows = await db
				.select()
				.from(busEvents)
				.where(eq(busEvents.accountId, accountId))
				.orderBy(asc(busEvents.seq));
			return rows.map((row) => ({
				seq: row.seq,
				event: {
					id: row.id,
					from: row.fromAgent,
					to: row.toAgent,
					kind: row.kind,
					skill: row.skill,
					text: row.body,
					payload: row.payload,
					writes: row.writes,
					time: row.timeText,
					trace: row.trace,
				},
			}));
		} catch (error) {
			throw hidden(error, connectionString);
		}
	});
}

export function readBusState(connectionString: string, accountId: string): Promise<{ key: string; value: string }[]> {
	return withDatabase(connectionString, async (db) => {
		try {
			return await db
				.select({ key: stateEntries.key, value: stateEntries.value })
				.from(stateEntries)
				.where(eq(stateEntries.accountId, accountId));
		} catch (error) {
			throw hidden(error, connectionString);
		}
	});
}
