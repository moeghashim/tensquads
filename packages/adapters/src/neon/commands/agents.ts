import type { AccountScope, Autonomy } from "@tensquads/domain";

import type { AppDatabase } from "../postgres.ts";

export async function setAgentOn(
	_db: AppDatabase,
	_scope: AccountScope,
	_agentId: string,
	_on: boolean,
): Promise<void> {}

export async function setSkillOn(
	_db: AppDatabase,
	_scope: AccountScope,
	_agentId: string,
	_skillId: string,
	_on: boolean,
): Promise<void> {}

export async function setAutonomy(
	_db: AppDatabase,
	_scope: AccountScope,
	_agentId: string,
	_autonomy: Autonomy,
): Promise<void> {}

export async function askRevise(_db: AppDatabase, _scope: AccountScope, _agentId: string): Promise<void> {}
