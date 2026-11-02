import { redirect } from "@tanstack/react-router";

import { requireClerkUser } from "./session.ts";
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
	const userId = await requireClerkUser();
	const connection = await databaseUrl();
	if (connection.length === 0) {
		throw new Error("The database is not configured.");
	}
	const { openPostgres, accountForClerkUser } = await import("@tensquads/adapters");
	const database = openPostgres(connection);
	try {
		const account = await accountForClerkUser(database.db, userId);
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

export async function sendWorkspace(method: "beginSend" | "finishSend", data: string) {
	return requireWorkspace(async (scope, db) => {
		const { createRepositories } = await import("@tensquads/adapters");
		const { Kernel } = await import("@tensquads/kernel");
		return new Kernel(createRepositories(db))[method](scope, data);
	});
}
