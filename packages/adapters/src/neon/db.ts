import { readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { schema } from "./schema.ts";

const migrationSql = readFileSync(new URL("./migration.sql", import.meta.url), "utf8");

export type AppDatabase = PgliteDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

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
	const client = postgres(connectionString, { ssl: "require", max: 1 });
	return {
		db: drizzlePostgres(client, { schema }),
		migrate: async () => {
			await client.unsafe(migrationSql);
		},
		close: async () => {
			await client.end();
		},
	};
}
