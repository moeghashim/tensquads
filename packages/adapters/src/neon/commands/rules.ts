import type { AccountScope, RuleDraft } from "@tensquads/domain";
import { requireScope } from "@tensquads/domain";
import { and, eq } from "drizzle-orm";

import {
	nextRuleId,
	setLimit as planLimit,
	addRule as planRule,
	setRuleOn as planRuleOn,
} from "../../../../kernel/src/plugins/policy-rules.ts";
import { PENDING_TASK_WINDOW_MS } from "../../pending-window.ts";
import { workspaceTransaction } from "../lock.ts";
import type { AppDatabase } from "../postgres.ts";
import { rules, stateEntries } from "../schema.ts";

const writeDeadline = { deadlineMs: PENDING_TASK_WINDOW_MS };

type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

function accountIdOf(scope: AccountScope): string {
	const checked = requireScope(scope);
	if (checked.mode !== "account") {
		throw new Error("A rule change needs an account.");
	}
	return checked.accountId;
}

export async function setRuleOn(db: AppDatabase, scope: AccountScope, id: string, on: boolean): Promise<void> {
	const accountId = accountIdOf(scope);
	const planned = planRuleOn(on);
	await workspaceTransaction(
		db,
		async (tx) => {
			await updateRuleOn(tx, accountId, id, planned.on);
		},
		writeDeadline,
	);
}

async function updateRuleOn(tx: Tx, accountId: string, id: string, on: boolean): Promise<void> {
	const rows = await tx
		.select({ id: rules.id })
		.from(rules)
		.where(and(eq(rules.accountId, accountId), eq(rules.id, id)));
	if (!rows[0]) {
		throw new Error("The rule is missing.");
	}
	await tx
		.update(rules)
		.set({ isOn: on })
		.where(and(eq(rules.accountId, accountId), eq(rules.id, id)));
}

export async function addRule(db: AppDatabase, scope: AccountScope, draft: RuleDraft): Promise<string | null> {
	const planned = planRule(draft);
	if (!planned) {
		return null;
	}
	const accountId = accountIdOf(scope);
	return workspaceTransaction(db, async (tx) => insertRule(tx, accountId, planned), writeDeadline);
}

async function insertRule(
	tx: Tx,
	accountId: string,
	planned: { readonly when: string; readonly agent: string; readonly action: string; readonly approval: string },
): Promise<string> {
	const existing = await tx
		.select({ id: rules.id, sortOrder: rules.sortOrder })
		.from(rules)
		.where(eq(rules.accountId, accountId));
	const id = nextRuleId(existing.map((row) => row.id));
	const sortOrder = nextSort(existing.map((row) => row.sortOrder));
	await tx.insert(rules).values({
		accountId,
		id,
		ruleWhen: planned.when,
		agent: planned.agent,
		action: planned.action,
		approval: planned.approval,
		isOn: true,
		sortOrder,
	});
	return id;
}

export async function setLimit(db: AppDatabase, scope: AccountScope, key: string, value: number): Promise<void> {
	const planned = planLimit(key, value);
	if (!planned) {
		throw new Error("The limit is not valid.");
	}
	const accountId = accountIdOf(scope);
	await workspaceTransaction(
		db,
		async (tx) => {
			await writeLimit(tx, accountId, planned.key, planned.value);
		},
		writeDeadline,
	);
}

async function writeLimit(tx: Tx, accountId: string, key: string, value: number): Promise<void> {
	const rows = await tx
		.select({ key: stateEntries.key, sortOrder: stateEntries.sortOrder })
		.from(stateEntries)
		.where(eq(stateEntries.accountId, accountId));
	const current = rows.find((row) => row.key === key);
	await tx
		.insert(stateEntries)
		.values({
			accountId,
			key,
			value: JSON.stringify(value),
			sortOrder: current?.sortOrder ?? nextSort(rows.map((row) => row.sortOrder)),
		})
		.onConflictDoUpdate({
			target: [stateEntries.accountId, stateEntries.key],
			set: { value: JSON.stringify(value) },
		});
}

function nextSort(orders: readonly number[]): number {
	if (orders.length === 0) {
		return 0;
	}
	return Math.max(...orders) + 1;
}
