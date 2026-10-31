import { createRepositories, openPostgres, saveWorkspace } from "@tensquads/adapters";
import { sql } from "drizzle-orm";

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
	const existing = (await opened.db.execute(sql`SELECT to_regclass('public.accounts') AS name`)) as {
		rows: { name: string | null }[];
	};
	if (!existing.rows[0]?.name) {
		await opened.migrate();
	}
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
	const code = error && typeof error === "object" && "code" in error ? String(error.code) : "Error";
	console.error(`seed failed: ${code}`);
	process.exitCode = 1;
} finally {
	await opened.close();
}
