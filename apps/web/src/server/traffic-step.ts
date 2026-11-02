import type { AppDatabase } from "@tensquads/adapters";
import { createRepositories } from "@tensquads/adapters";
import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";
import type { AccountScope } from "@tensquads/kernel";
import { Kernel } from "@tensquads/kernel";

const unfinished = "The workspace write did not finish.";

// startedAt is the server function's clock. The read and the write share it.
export async function advanceTrafficAccount(db: AppDatabase, scope: AccountScope, startedAt: number): Promise<string> {
	const deadlineAt = startedAt + PENDING_TASK_WINDOW_MS;
	const repositories = createRepositories(db);
	const before = new Set((await repositories.bus.listEvents(scope)).map((event) => event.id));
	if (Date.now() >= deadlineAt) throw new Error(unfinished);
	await new Kernel(repositories).nextEvent(scope, deadlineAt);
	const after = await repositories.bus.listEvents(scope);
	return after.filter((event) => !before.has(event.id)).at(-1)?.id ?? "";
}
