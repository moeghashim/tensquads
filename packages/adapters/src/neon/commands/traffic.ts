import type { AccountScope } from "@tensquads/domain";

import type { AppDatabase } from "../postgres.ts";

export async function nextEvent(_db: AppDatabase, _scope: AccountScope): Promise<void> {}
