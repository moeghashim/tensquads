import { readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { Pool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";

import { schema } from "./schema.ts";

const migrationSql = readFileSync(new URL("./migration.sql", import.meta.url), "utf8");

export type AppDatabase = PgliteDatabase<typeof schema> | NeonDatabase<typeof schema>;

export function migrationStatements(script: string): readonly string[] {
	return script
		.split(/;\s*(?:\n|$)/)
		.map((statement) => statement.trim())
		.filter((statement) => statement.length > 0);
}

export async function openPglite(): Promise<{ db: AppDatabase; close: () => Promise<void> }> {
	const client = new PGlite();
	await client.exec(migrationSql);
	return {
		db: drizzlePglite(client, { schema }),
		close: async () => {
			await client.close();
		},
	};
}

export function openPostgres(connectionString: string): {
	db: AppDatabase;
	migrate: () => Promise<void>;
	close: () => Promise<void>;
} {
	const pool = new Pool({ connectionString, max: 1 });
	return {
		db: drizzleNeon(pool, { schema }),
		migrate: async () => {
			const client = await pool.connect();
			try {
				for (const statement of migrationStatements(migrationSql)) {
					await client.query(statement);
				}
			} finally {
				client.release();
			}
		},
		close: async () => {
			await pool.end();
		},
	};
}
