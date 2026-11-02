import type { AccountScope, RuleDraft } from "@tensquads/domain";

import type { AppDatabase } from "../postgres.ts";

export async function setRuleOn(_db: AppDatabase, _scope: AccountScope, _id: string, _on: boolean): Promise<void> {}

export async function addRule(_db: AppDatabase, _scope: AccountScope, _draft: RuleDraft): Promise<void> {}

export async function setLimit(_db: AppDatabase, _scope: AccountScope, _key: string, _value: number): Promise<void> {}
