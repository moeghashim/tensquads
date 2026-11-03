import type { AccountScope, Fenced, Rule, RuleDraft, StoredLimit, WriteFence } from "@tensquads/domain";
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
import { claimWriteFence } from "./write-fence.ts";

const unfinished = "The workspace write did not finish.";

type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

function remainingWindow(deadlineAt: number | undefined): { readonly absolute: number; readonly deadlineMs: number } {
	const absolute = deadlineAt ?? Date.now() + PENDING_TASK_WINDOW_MS;
	const deadlineMs = absolute - Date.now();
	// A lock_timeout of 0 waits forever, so a few milliseconds left is already late.
	if (deadlineMs < 4) throw new Error(unfinished);
	return { absolute, deadlineMs };
}

async function writeWithin<T>(
	db: AppDatabase,
	accountId: string,
	deadlineAt: number | undefined,
	work: (tx: Tx) => Promise<T>,
): Promise<T> {
	const window = remainingWindow(deadlineAt);
	return workspaceTransaction(
		db,
		async (tx, constrainDeadline) => {
			constrainDeadline(window.absolute);
			return work(tx);
		},
		{ deadlineMs: window.deadlineMs, accountId },
	);
}

function accountIdOf(scope: AccountScope): string {
	const checked = requireScope(scope);
	if (checked.mode !== "account") {
		throw new Error("A rule change needs an account.");
	}
	return checked.accountId;
}

export async function setRuleOn(
	db: AppDatabase,
	scope: AccountScope,
	id: string,
	on: boolean,
	fence: WriteFence,
	deadlineAt?: number,
): Promise<Fenced<Rule>> {
	const accountId = accountIdOf(scope);
	const planned = planRuleOn(on);
	return writeWithin(db, accountId, deadlineAt, async (tx) => {
		const claimed = await claimWriteFence(tx, accountId, id, fence);
		if (!claimed) {
			return { status: "superseded", row: await readRule(tx, accountId, id) };
		}
		await updateRuleOn(tx, accountId, id, planned.on);
		return { status: "written", row: await readRule(tx, accountId, id) };
	});
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

export async function addRule(
	db: AppDatabase,
	scope: AccountScope,
	draft: RuleDraft,
	deadlineAt?: number,
): Promise<Rule | null> {
	const planned = planRule(draft);
	if (!planned) {
		return null;
	}
	const accountId = accountIdOf(scope);
	return writeWithin(db, accountId, deadlineAt, async (tx) => {
		const id = await insertRule(tx, accountId, planned);
		return readRule(tx, accountId, id);
	});
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

export async function setLimit(
	db: AppDatabase,
	scope: AccountScope,
	key: string,
	value: number,
	fence: WriteFence,
	deadlineAt?: number,
): Promise<Fenced<StoredLimit>> {
	const planned = planLimit(key, value);
	if (!planned) {
		throw new Error("The limit is not valid.");
	}
	const accountId = accountIdOf(scope);
	return writeWithin(db, accountId, deadlineAt, async (tx) => {
		const claimed = await claimWriteFence(tx, accountId, planned.key, fence);
		if (!claimed) {
			return { status: "superseded", row: await readLimit(tx, accountId, planned.key) };
		}
		await writeLimit(tx, accountId, planned.key, planned.value);
		return { status: "written", row: await readLimit(tx, accountId, planned.key) };
	});
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

async function readRule(tx: Tx, accountId: string, id: string): Promise<Rule> {
	const rows = await tx
		.select({
			id: rules.id,
			when: rules.ruleWhen,
			agent: rules.agent,
			action: rules.action,
			approval: rules.approval,
			on: rules.isOn,
		})
		.from(rules)
		.where(and(eq(rules.accountId, accountId), eq(rules.id, id)));
	const row = rows[0];
	if (!row) {
		throw new Error("The rule is missing.");
	}
	return row;
}

async function readLimit(tx: Tx, accountId: string, key: string): Promise<StoredLimit> {
	const rows = await tx
		.select({ value: stateEntries.value })
		.from(stateEntries)
		.where(and(eq(stateEntries.accountId, accountId), eq(stateEntries.key, key)));
	const row = rows[0];
	if (!row) {
		throw new Error("The limit is missing.");
	}
	const value = JSON.parse(row.value) as unknown;
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error("The limit is missing.");
	}
	return { key, value };
}

function nextSort(orders: readonly number[]): number {
	if (orders.length === 0) {
		return 0;
	}
	return Math.max(...orders) + 1;
}
