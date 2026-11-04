import { neonConfig, Pool } from "@neondatabase/serverless";
import type { PublishedEvent } from "@tensquads/kernel";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { busEvents, stateEntries } from "../neon/schema.ts";
import { traceFor } from "../trace.ts";

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
	return { pool, db: drizzle(pool, { schema: { busEvents, stateEntries } }) };
}

export async function writePending(
	connectionString: string,
	accountId: string,
	rows: readonly PendingBusRow[],
): Promise<void> {
	const { pool, db } = database(connectionString);
	try {
		await db.transaction(async (txn) => {
			for (const row of rows) {
				await txn
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
					.onConflictDoNothing();
				await writeState(txn, accountId, row.seq, row.event.set);
			}
		});
	} catch (error) {
		throw hidden(error, connectionString);
	} finally {
		await pool.end();
	}
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

export async function readBusHistory(connectionString: string, accountId: string): Promise<PendingBusRow[]> {
	const { pool, db } = database(connectionString);
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
	} finally {
		await pool.end();
	}
}
