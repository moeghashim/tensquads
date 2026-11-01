import { Pool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import type { PgliteDatabase } from "drizzle-orm/pglite";

import { migrationSql } from "./migration-sql.ts";
import { schema } from "./schema.ts";

export type AppDatabase = PgliteDatabase<typeof schema> | NeonDatabase<typeof schema>;

function migrationStatements(script: string): readonly string[] {
	return script
		.split(/;\s*(?:\n|$)/)
		.map((statement) => statement.trim())
		.filter((statement) => statement.length > 0);
}

async function applyMigration(pool: Pool): Promise<void> {
	const client = await pool.connect();
	try {
		for (const statement of migrationStatements(migrationSql)) {
			await client.query(statement);
		}
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
