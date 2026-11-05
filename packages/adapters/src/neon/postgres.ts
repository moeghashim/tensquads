import { createHash } from "node:crypto";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import type { PgliteDatabase } from "drizzle-orm/pglite";

import { takeWriterLock } from "./lock.ts";
import { migrationSql } from "./migration-sql.ts";
import { schema } from "./schema.ts";

// A matching revision means this SQL already ran. Later calls take no lock.
export const migrationRevision = createHash("sha256").update(migrationSql).digest("hex");

const revisionTable = `CREATE TABLE IF NOT EXISTS schema_revision (
	id integer PRIMARY KEY,
	version text NOT NULL
)`;

export type AppDatabase = PgliteDatabase<typeof schema> | NeonDatabase<typeof schema>;

function singleQuoteEnd(script: string, index: number): number {
	index += 1;
	while (index < script.length) {
		if (script.startsWith("''", index)) {
			index += 2;
			continue;
		}
		if (script[index] === "'") return index + 1;
		index += 1;
	}
	return index;
}

function dollarQuoteEnd(script: string, index: number): number | null {
	const tag = /^\$[A-Za-z0-9_]*\$/.exec(script.slice(index));
	if (!tag) return null;
	const end = script.indexOf(tag[0], index + tag[0].length);
	return end === -1 ? script.length : end + tag[0].length;
}

function statementEnd(script: string, index: number): number | null {
	const end = /^;\s*(?:\n|$)/.exec(script.slice(index));
	return end ? index + end[0].length : null;
}

// Semicolons inside dollar quotes belong to the function body. A statement ends at a
// semicolon that is outside quotes and is followed by a newline or the end of the script.
export function migrationStatements(script: string): readonly string[] {
	const statements: string[] = [];
	let start = 0;
	let index = 0;
	while (index < script.length) {
		if (script[index] === "'") {
			index = singleQuoteEnd(script, index);
			continue;
		}
		const dollarEnd = dollarQuoteEnd(script, index);
		if (dollarEnd !== null) {
			index = dollarEnd;
			continue;
		}
		const end = statementEnd(script, index);
		if (end !== null) {
			const statement = script.slice(start, index).trim();
			if (statement.length > 0) statements.push(statement);
			index = end;
			start = index;
			continue;
		}
		index += 1;
	}
	const tail = script.slice(start).trim();
	if (tail.length > 0) statements.push(tail);
	return statements;
}

async function storedRevision(client: PoolClient): Promise<string | null> {
	const found = await client.query("SELECT to_regclass('public.schema_revision') AS name");
	const name = found.rows[0]?.name;
	if (name === null || name === undefined) return null;
	const result = await client.query("SELECT version FROM schema_revision WHERE id = 1");
	const version = result.rows[0]?.version;
	return typeof version === "string" ? version : null;
}

async function applyMigration(pool: Pool): Promise<void> {
	const client = await pool.connect();
	let began = false;
	try {
		// The read takes no advisory lock, so a current database does not block writers.
		if ((await storedRevision(client)) === migrationRevision) return;
		await client.query("BEGIN");
		began = true;
		await takeWriterLock((statement) => client.query(statement));
		await client.query(revisionTable);
		if ((await storedRevision(client)) === migrationRevision) {
			await client.query("COMMIT");
			return;
		}
		for (const statement of migrationStatements(migrationSql)) {
			await client.query(statement);
		}
		await client.query(
			`INSERT INTO schema_revision (id, version) VALUES (1, '${migrationRevision}') ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version`,
		);
		await client.query("COMMIT");
	} catch (error) {
		if (began) await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}

export function openPostgres(connectionString: string): {
	db: AppDatabase;
	migrate: () => Promise<void>;
	close: () => Promise<void>;
} {
	const pool = new Pool({ connectionString, max: 1 });
	return {
		db: drizzleNeon(pool, { schema }),
		migrate: () => applyMigration(pool),
		close: async () => {
			await pool.end();
		},
	};
}
