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
	// CREATE TABLE IF NOT EXISTS makes a second seed safe. postgres.js does not
	// return the same `{ rows }` shape as PGlite, so do not branch on to_regclass.
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
