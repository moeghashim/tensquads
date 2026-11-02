import type { AccountScope, Mandate, MandateDraft } from "@tensquads/domain";
import { requireScope } from "@tensquads/domain";
import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "../postgres.ts";
import { approvals, mandates, rules } from "../schema.ts";

// A Mandate never changes after it is made.
// This file has create and read only. It has no update and no delete.
// The primary key (account_id, approval_id) lets an Approval hold at most one Mandate.
// BEFORE UPDATE on mandates always raises. BEFORE DELETE raises while the account row remains.
// Removing the account cascades this row, and that delete is allowed.

export async function createMandate(db: AppDatabase, scope: AccountScope, draft: MandateDraft): Promise<Mandate> {
	const accountId = accountOf(scope);
	const approval = await oneApproval(db, accountId, draft.approvalId);
	if (approval?.status !== "Approved") {
		throw new Error("An Approval has a Mandate only after a person says yes.");
	}
	const existing = await db
		.select({ approvalId: mandates.approvalId })
		.from(mandates)
		.where(and(eq(mandates.accountId, accountId), eq(mandates.approvalId, draft.approvalId)));
	if (existing.length > 0) {
		throw new Error("An Approval holds exactly one Mandate.");
	}
	const ruleRows = await db
		.select()
		.from(rules)
		.where(and(eq(rules.accountId, accountId), eq(rules.id, draft.ruleId)));
	const rule = ruleRows[0];
	if (!rule) {
		throw new Error("A Mandate records a rule that exists.");
	}
	const row = {
		accountId,
		approvalId: draft.approvalId,
		ruleId: rule.id,
		ruleWhen: rule.ruleWhen,
		ruleAction: rule.action,
		ruleApproval: rule.approval,
		limitValue: draft.limitValue,
		policyVersion: draft.policyVersion,
		saidYes: draft.saidYes,
		saidAt: draft.at,
	};
	await db.insert(mandates).values(row);
	return toMandate(row);
}

export async function mandate(db: AppDatabase, scope: AccountScope, approvalId: string): Promise<Mandate | null> {
	const accountId = accountOf(scope);
	const rows = await db
		.select()
		.from(mandates)
		.where(and(eq(mandates.accountId, accountId), eq(mandates.approvalId, approvalId)));
	const row = rows[0];
	return row ? toMandate(row) : null;
}

function accountOf(scope: AccountScope): string {
	const checked = requireScope(scope);
	if (checked.mode !== "account") {
		throw new Error("A Mandate belongs to one account.");
	}
	return checked.accountId;
}

async function oneApproval(db: AppDatabase, accountId: string, approvalId: string) {
	const rows = await db
		.select()
		.from(approvals)
		.where(and(eq(approvals.accountId, accountId), eq(approvals.id, approvalId)));
	return rows[0];
}

function toMandate(row: {
	approvalId: string;
	ruleId: string;
	ruleWhen: string;
	ruleAction: string;
	ruleApproval: string;
	limitValue: number;
	policyVersion: string;
	saidYes: string;
	saidAt: Date | string;
}): Mandate {
	return {
		approvalId: row.approvalId,
		ruleId: row.ruleId,
		ruleWhen: row.ruleWhen,
		ruleAction: row.ruleAction,
		ruleApproval: row.ruleApproval,
		limitValue: row.limitValue,
		policyVersion: row.policyVersion,
		saidYes: row.saidYes,
		at: asDate(row.saidAt),
	};
}

function asDate(value: Date | string): Date {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new Error("A Mandate has a time.");
	}
	return date;
}
