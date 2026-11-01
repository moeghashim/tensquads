import { redirect } from "@tanstack/react-router";

import { workerEnv } from "./worker-env.ts";

interface AccountScope {
	readonly accountId: string;
	readonly mode: "account";
}

async function databaseUrl(): Promise<string> {
	const test = await workerEnv("TEST_DATABASE_URL");
	if (test.length > 0) {
		return test;
	}
	return workerEnv("NEON_POSTGRES_CONNECTION_STRING");
}

export async function requireWorkspace<T>(work: (scope: AccountScope, db: WorkspaceDb) => Promise<T>): Promise<T> {
	const secret = await workerEnv("CLERK_SECRET_KEY");
	if (secret.length === 0) {
		throw redirect({ to: "/signin" });
	}
	const { auth } = await import("@clerk/tanstack-react-start/server");
	const session = await auth();
	if (!session.userId) {
		throw redirect({ to: "/signin" });
	}
	const connection = await databaseUrl();
	if (connection.length === 0) {
		throw new Error("The database is not configured.");
	}
	const { openPostgres, accountForClerkUser } = await import("@tensquads/adapters");
	const database = openPostgres(connection);
	try {
		const account = await accountForClerkUser(database.db, session.userId);
		if (!account) {
			throw redirect({ to: "/signup" });
		}
		return await work({ accountId: account.id, mode: "account" }, database.db);
	} finally {
		await database.close();
	}
}

type WorkspaceDb = Parameters<typeof readFrame>[0];

export async function readFrame(db: import("@tensquads/adapters").AppDatabase, scope: AccountScope) {
	const { readWorkspaceFrame } = await import("@tensquads/adapters");
	return readWorkspaceFrame(db, scope);
}
