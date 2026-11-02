import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrationSql } from "../src/neon/migration-sql.ts";
import type { AppDatabase } from "../src/neon/postgres.ts";
import { schema } from "../src/neon/schema.ts";

interface QueryLogger {
	logQuery(query: string, params: unknown[]): void;
}

export async function openPglite(
	logger?: QueryLogger,
): Promise<{ client: PGlite; db: AppDatabase; close: () => Promise<void> }> {
	const client = new PGlite();
	await client.exec(migrationSql);
	return {
		client,
		db: drizzlePglite(client, { schema, logger }),
		close: async () => {
			await client.close();
		},
	};
}
