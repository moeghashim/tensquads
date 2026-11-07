import { and, eq } from "drizzle-orm";

import { openPostgres } from "./neon/postgres.ts";
import { agents } from "./neon/schema.ts";

// The stored on/off switch of one agent. A missing agent counts as off,
// so a heartbeat never starts a machine that the account does not know.
export async function storedAgentOn(databaseUrl: string, accountId: string, agentId: string): Promise<boolean> {
	const database = openPostgres(databaseUrl);
	try {
		const rows = await database.db
			.select({ on: agents.isOn })
			.from(agents)
			.where(and(eq(agents.accountId, accountId), eq(agents.id, agentId)));
		return rows[0]?.on === true;
	} finally {
		await database.close();
	}
}
