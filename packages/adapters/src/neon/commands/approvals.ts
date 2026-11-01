import type { AccountScope } from "@tensquads/domain";

import type { AppDatabase } from "../postgres.ts";

export async function decide(_db: AppDatabase, _scope: AccountScope, _id: string, _ok: boolean): Promise<void> {}

export async function decideMission(_db: AppDatabase, _scope: AccountScope, _id: string, _ok: boolean): Promise<void> {}
