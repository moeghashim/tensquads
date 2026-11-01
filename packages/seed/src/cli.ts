import { createRepositories, openPostgres, saveWorkspace } from "@tensquads/adapters";

import { loadEnv } from "./env.ts";
import { workspaceFromDesign } from "./workspace.ts";

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
	const snapshot = workspaceFromDesign();
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
