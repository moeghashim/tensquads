import type { AppDatabase } from "@tensquads/adapters";
import type { AccountScope } from "@tensquads/domain";

import { databaseUrl } from "./database-url.ts";
import { requireSuperAdmin } from "./super-admin.ts";

// The only platform scope in the web app. Scope validation is not authentication.
const platformScope: AccountScope = { accountId: "platform", mode: "platform" };

export async function withPlatform<T>(work: (scope: AccountScope, db: AppDatabase) => Promise<T>): Promise<T> {
	await requireSuperAdmin();
	const connection = await databaseUrl();
	if (connection.length === 0) {
		throw new Error("The database is not configured.");
	}
	const { openPostgres } = await import("@tensquads/adapters");
	const database = openPostgres(connection);
	try {
		return await work(platformScope, database.db);
	} finally {
		await database.close();
	}
}
