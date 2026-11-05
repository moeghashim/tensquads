import { redirect } from "@tanstack/react-router";
import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";

import { databaseUrl } from "./database-url.ts";
import { requireClerkSession } from "./session.ts";
import { readSpecialAccount } from "./special-session.ts";
import { isSuperAdmin } from "./super-admin.ts";

const unfinished = "The workspace write did not finish.";

interface AccountScope {
	readonly accountId: string;
	readonly mode: "account";
}

export async function requireWorkspace<T>(
	work: (scope: AccountScope, db: WorkspaceDb) => Promise<T>,
	write?: { readonly accountId: string; readonly startedAt: number },
): Promise<T> {
	const { userId } = await requireClerkSession();
	const admin = await isSuperAdmin();
	const connection = await databaseUrl();
	if (connection.length === 0) {
		throw new Error("The database is not configured.");
	}
	const { openPostgres, accountForClerkUser } = await import("@tensquads/adapters");
	const database = openPostgres(connection);
	try {
		if (write && Date.now() >= write.startedAt + PENDING_TASK_WINDOW_MS) {
			throw new Error(unfinished);
		}
		if (admin) {
			const target = await specialTarget(readSpecialAccount());
			if (!target) {
				throw redirect({ to: "/admin" });
			}
			if (write && write.accountId !== target) throw new Error(unfinished);
			return await work({ accountId: target, mode: "account" }, database.db);
		}
		const account = await accountForClerkUser(database.db, userId);
		if (!account) {
			throw redirect({ to: "/signup" });
		}
		if (write && write.accountId !== account.id) throw new Error(unfinished);
		return await work({ accountId: account.id, mode: "account" }, database.db);
	} finally {
		await database.close();
	}
}

async function specialTarget(accountId: string | null): Promise<string | null> {
	if (!accountId) {
		return null;
	}
	const { createRepositories } = await import("@tensquads/adapters");
	const { withPlatform } = await import("./platform-scope.ts");
	const found = await withPlatform(async (scope, db) => {
		const rows = await createRepositories(db).platform.listAccounts(scope);
		return rows.some((row) => row.id === accountId);
	});
	return found ? accountId : null;
}

type WorkspaceDb = Parameters<typeof readFrame>[0];

export async function readFrame(db: import("@tensquads/adapters").AppDatabase, scope: AccountScope) {
	const { readWorkspaceFrame } = await import("@tensquads/adapters");
	return readWorkspaceFrame(db, scope);
}

export async function sendWorkspace(method: "beginSend" | "finishSend", data: string, accountId: string) {
	const startedAt = Date.now();
	return requireWorkspace(
		async (scope, db) => {
			const { createRepositories } = await import("@tensquads/adapters");
			const { Kernel } = await import("@tensquads/kernel");
			return new Kernel(createRepositories(db))[method](scope, data);
		},
		{ accountId, startedAt },
	);
}
