import { createRepositories, openPostgres, saveWorkspace, type WorkspaceSnapshot } from "@tensquads/adapters";

import { loadEnv } from "./env.ts";
import { workspaceFromDesign } from "./workspace.ts";

function stampDemoOwner(snapshot: WorkspaceSnapshot, clerkUserId: string | undefined): WorkspaceSnapshot {
	const id = clerkUserId?.trim() ?? "";
	if (id.length === 0) {
		return snapshot;
	}
	return {
		...snapshot,
		accounts: snapshot.accounts.map((entry) => (entry.account.id === "demo" ? { ...entry, clerkUserId: id } : entry)),
	};
}

loadEnv();
const connection = process.env.NEON_POSTGRES_CONNECTION_STRING;
if (!connection) {
	console.error("seed failed: NEON_POSTGRES_CONNECTION_STRING is missing");
	process.exit(1);
}

const opened = openPostgres(connection);
try {
	// The migration creates missing tables and adds columns an older database lacks.
	// Apply it on every seed. Do not branch on a driver-specific row shape.
	await opened.migrate();
	const snapshot = stampDemoOwner(workspaceFromDesign(), process.env.DEMO_CLERK_USER_ID);
	await saveWorkspace(opened.db, snapshot);
	const totals = await createRepositories(opened.db).platform.totals({
		accountId: "platform",
		mode: "platform",
	});
	console.log(`accounts ${totals.accounts}`);
	console.log(`agents ${totals.agents}`);
	console.log(`squads ${totals.squads}`);
	console.log(`mrr ${totals.mrr}`);
	console.log(`allTime ${totals.allTime}`);
	console.log(`tasksDone ${totals.tasksDone}`);
	console.log(`images ${totals.images}`);
	console.log(`openBugs ${totals.openBugs}`);
	console.log(`featuresRequested ${totals.featuresRequested}`);
} catch (error) {
	const name = error instanceof Error ? error.name : "Error";
	const code = error && typeof error === "object" && "code" in error && error.code ? String(error.code) : "";
	console.error(code ? `seed failed: ${name} ${code}` : `seed failed: ${name}`);
	process.exitCode = 1;
} finally {
	await opened.close();
}
