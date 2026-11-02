import { Pool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import type { PgliteDatabase } from "drizzle-orm/pglite";

import { migrationSql } from "./migration-sql.ts";
import { schema } from "./schema.ts";

export type AppDatabase = PgliteDatabase<typeof schema> | NeonDatabase<typeof schema>;

// Semicolons inside dollar quotes belong to the function body. A statement ends at a
// semicolon that is outside quotes and is followed by a newline or the end of the script.
export function migrationStatements(script: string): readonly string[] {
	const statements: string[] = [];
	let start = 0;
	let index = 0;
	let quote: "'" | null = null;
	let dollar: string | null = null;
	while (index < script.length) {
		const rest = script.slice(index);
		if (dollar) {
			if (rest.startsWith(dollar)) {
				index += dollar.length;
				dollar = null;
				continue;
			}
			index += 1;
			continue;
		}
		if (quote) {
			if (rest.startsWith("''")) {
				index += 2;
				continue;
			}
			if (script[index] === "'") quote = null;
			index += 1;
			continue;
		}
		if (script[index] === "'") {
			quote = "'";
			index += 1;
			continue;
		}
		const tag = /^\$[A-Za-z0-9_]*\$/.exec(rest);
		if (script[index] === "$" && tag) {
			dollar = tag[0];
			index += tag[0].length;
			continue;
		}
		const end = /^;\s*(?:\n|$)/.exec(rest);
		if (end) {
			const statement = script.slice(start, index).trim();
			if (statement.length > 0) statements.push(statement);
			index += end[0].length;
			start = index;
			continue;
		}
		index += 1;
	}
	const tail = script.slice(start).trim();
	if (tail.length > 0) statements.push(tail);
	return statements;
}

async function applyMigration(pool: Pool): Promise<void> {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		await client.query("SELECT pg_advisory_xact_lock(1952804467, 1)");
		for (const statement of migrationStatements(migrationSql)) {
			await client.query(statement);
		}
		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
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
