import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createRepositories, schema } from "@tensquads/adapters";
import type { Mandate, MandateDraft } from "@tensquads/domain";
import { and, eq, sql } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { replaceDemoAccount } from "../../seed/src/demo-account.ts";
import { migrationSql } from "../src/neon/migration-sql.ts";
import { type AppDatabase, migrationStatements, openPostgres } from "../src/neon/postgres.ts";
import { openPglite } from "./pglite.ts";

test("a change to a rule after an Approval does not change that Approval's Mandate", async () => {
	const opened = await openPglite();
	const accountId = "mandate-account";
	const scope = { accountId, mode: "account" as const };
	try {
		await replaceDemoAccount(opened.db, accountId, "clerk-mandate");
		const policy = createRepositories(opened.db).policy;
		const rule = (await policy.listRules(scope))[0];
		const pending = (await policy.listApprovals(scope)).find((item) => item.status === "Pending");
		assert.ok(rule);
		assert.ok(pending);
		const at = new Date("2026-11-02T12:00:00.000Z");
		const draft: MandateDraft = {
			approvalId: pending.id,
			ruleId: rule.id,
			limitValue: 40,
			policyVersion: "policy-1",
			saidYes: "owner",
			at,
		};
		await assert.rejects(() => policy.createMandate(scope, draft), /only after a person says yes/);

		const approvalId = "mandate-approval";
		await opened.db.insert(schema.approvals).values({
			accountId,
			id: approvalId,
			agent: pending.agent,
			title: pending.title,
			detail: pending.detail,
			amount: pending.amount,
			status: "Approved",
			sortOrder: 40,
		});
		const made = await policy.createMandate(scope, { ...draft, approvalId });
		assert.equal(made.ruleAction, rule.action);
		assert.equal(made.ruleWhen, rule.when);
		assert.equal(made.ruleApproval, rule.approval);
		assert.equal(made.limitValue, 40);
		assert.equal(made.policyVersion, "policy-1");
		assert.equal(made.saidYes, "owner");
		assert.equal(made.at.getTime(), at.getTime());

		await opened.db
			.update(schema.rules)
			.set({ action: "changed-after-yes", ruleWhen: "changed-after-yes", approval: "changed-after-yes" })
			.where(and(eq(schema.rules.accountId, accountId), eq(schema.rules.id, rule.id)));
		const changed = (await policy.listRules(scope)).find((item) => item.id === rule.id);
		assert.equal(changed?.action, "changed-after-yes");
		const again = await policy.mandate(scope, approvalId);
		assert.deepEqual(again, made);
		assert.equal(again?.ruleAction, rule.action);

		await assert.rejects(() => policy.createMandate(scope, { ...draft, approvalId }), /exactly one Mandate/);
		assert.equal(await policy.mandate(scope, pending.id), null);
	} finally {
		await opened.close();
	}
});

const columns = [
	["account_id", "changed-account"],
	["approval_id", "changed-approval"],
	["rule_id", "changed-rule"],
	["rule_when", "changed-when"],
	["rule_action", "changed-action"],
	["rule_approval", "changed-rule-approval"],
	["limit_value", 999],
	["policy_version", "changed-policy"],
	["said_yes", "changed-person"],
	["said_at", "2020-01-01T00:00:00.000Z"],
] as const;

function errorText(error: unknown, depth = 0): string {
	if (!error || typeof error !== "object" || depth > 5) return "";
	const record = error as { message?: unknown; cause?: unknown };
	const own = typeof record.message === "string" ? record.message : "";
	return `${own}\n${errorText(record.cause, depth + 1)}`;
}

async function expectUnchanged(run: () => Promise<unknown>): Promise<void> {
	await assert.rejects(run, (error: unknown) => errorText(error).includes("A Mandate never changes."));
}

function plain(row: {
	accountId: string;
	approvalId: string;
	ruleId: string;
	ruleWhen: string;
	ruleAction: string;
	ruleApproval: string;
	limitValue: number;
	policyVersion: string;
	saidYes: string;
	saidAt: Date | string;
}) {
	return {
		accountId: row.accountId,
		approvalId: row.approvalId,
		ruleId: row.ruleId,
		ruleWhen: row.ruleWhen,
		ruleAction: row.ruleAction,
		ruleApproval: row.ruleApproval,
		limitValue: row.limitValue,
		policyVersion: row.policyVersion,
		saidYes: row.saidYes,
		saidAt: new Date(row.saidAt).toISOString(),
	};
}

async function mandateRow(db: AppDatabase, accountId: string, approvalId: string) {
	const rows = await db
		.select()
		.from(schema.mandates)
		.where(and(eq(schema.mandates.accountId, accountId), eq(schema.mandates.approvalId, approvalId)));
	assert.equal(rows.length, 1);
	const row = rows[0];
	assert.ok(row);
	return plain(row);
}

async function approveAndMandate(db: AppDatabase, accountId: string, clerkUserId: string) {
	await replaceDemoAccount(db, accountId, clerkUserId);
	const scope = { accountId, mode: "account" as const };
	const policy = createRepositories(db).policy;
	const rule = (await policy.listRules(scope))[0];
	const pending = (await policy.listApprovals(scope)).find((item) => item.status === "Pending");
	assert.ok(rule);
	assert.ok(pending);
	const approvalId = `${accountId}-approval`;
	await db.insert(schema.approvals).values({
		accountId,
		id: approvalId,
		agent: pending.agent,
		title: pending.title,
		detail: pending.detail,
		amount: pending.amount,
		status: "Approved",
		sortOrder: 40,
	});
	const at = new Date("2026-11-02T12:00:00.000Z");
	const draft: MandateDraft = {
		approvalId,
		ruleId: rule.id,
		limitValue: 40,
		policyVersion: "policy-1",
		saidYes: "owner",
		at,
	};
	const made: Mandate = await policy.createMandate(scope, draft);
	return { scope, policy, approvalId, draft, made };
}

async function deleteAccountChildren(db: AppDatabase, accountId: string): Promise<void> {
	await db.delete(schema.messages).where(eq(schema.messages.accountId, accountId));
	await db.delete(schema.threads).where(eq(schema.threads.accountId, accountId));
	await db.delete(schema.skills).where(eq(schema.skills.accountId, accountId));
	await db.delete(schema.machines).where(eq(schema.machines.accountId, accountId));
	await db.delete(schema.agents).where(eq(schema.agents.accountId, accountId));
	await db.delete(schema.squads).where(eq(schema.squads.accountId, accountId));
	await db.delete(schema.masters).where(eq(schema.masters.accountId, accountId));
	await db.delete(schema.rules).where(eq(schema.rules.accountId, accountId));
	await db.delete(schema.missionProposals).where(eq(schema.missionProposals.accountId, accountId));
	await db.delete(schema.busEvents).where(eq(schema.busEvents.accountId, accountId));
	await db.delete(schema.stateEntries).where(eq(schema.stateEntries.accountId, accountId));
	await db.delete(schema.dailyRevenue).where(eq(schema.dailyRevenue.accountId, accountId));
	await db.delete(schema.overviewTiles).where(eq(schema.overviewTiles.accountId, accountId));
	await db.delete(schema.subscriptions).where(eq(schema.subscriptions.accountId, accountId));
	await db.delete(schema.busCursors).where(eq(schema.busCursors.accountId, accountId));
}

async function refuseSqlChange(db: AppDatabase, accountId: string, approvalId: string): Promise<void> {
	const before = await mandateRow(db, accountId, approvalId);
	for (const [column, value] of columns) {
		await expectUnchanged(() =>
			db.execute(
				sql`UPDATE mandates SET ${sql.identifier(column)} = ${value} WHERE account_id = ${accountId} AND approval_id = ${approvalId}`,
			),
		);
		assert.deepEqual(await mandateRow(db, accountId, approvalId), before);
	}
	await expectUnchanged(() =>
		db.execute(sql`DELETE FROM mandates WHERE account_id = ${accountId} AND approval_id = ${approvalId}`),
	);
	assert.deepEqual(await mandateRow(db, accountId, approvalId), before);
}

test("SQL UPDATE of any Mandate column is refused and the row is unchanged", async () => {
	const opened = await openPglite();
	try {
		const accountId = "mandate-update";
		const { approvalId } = await approveAndMandate(opened.db, accountId, "clerk-mandate-update");
		await refuseSqlChange(opened.db, accountId, approvalId);
	} finally {
		await opened.close();
	}
});

test("direct SQL DELETE of a Mandate is refused and the row stays", async () => {
	const opened = await openPglite();
	try {
		const accountId = "mandate-delete";
		const { approvalId } = await approveAndMandate(opened.db, accountId, "clerk-mandate-delete");
		const before = await mandateRow(opened.db, accountId, approvalId);
		await expectUnchanged(() =>
			opened.db.execute(sql`DELETE FROM mandates WHERE account_id = ${accountId} AND approval_id = ${approvalId}`),
		);
		assert.deepEqual(await mandateRow(opened.db, accountId, approvalId), before);
	} finally {
		await opened.close();
	}
});

test("a second Mandate for that Approval is refused", async () => {
	const opened = await openPglite();
	try {
		const accountId = "mandate-second";
		const { scope, policy, draft, approvalId } = await approveAndMandate(
			opened.db,
			accountId,
			"clerk-mandate-second",
		);
		await assert.rejects(() => policy.createMandate(scope, draft), /exactly one Mandate/);
		assert.equal((await mandateRow(opened.db, accountId, approvalId)).limitValue, 40);
	} finally {
		await opened.close();
	}
});

test("removing the whole account removes its Mandate", async () => {
	const opened = await openPglite();
	try {
		const accountId = "mandate-account-delete";
		await approveAndMandate(opened.db, accountId, "clerk-mandate-account-delete");
		await deleteAccountChildren(opened.db, accountId);
		await opened.db.delete(schema.accounts).where(eq(schema.accounts.id, accountId));
		const mandates = await opened.db.select().from(schema.mandates).where(eq(schema.mandates.accountId, accountId));
		const accounts = await opened.db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
		assert.equal(mandates.length, 0);
		assert.equal(accounts.length, 0);
	} finally {
		await opened.close();
	}
});

test("replaceDemoAccount still works when the account has a Mandate", async () => {
	const opened = await openPglite();
	try {
		const accountId = "mandate-replace";
		await approveAndMandate(opened.db, accountId, "clerk-mandate-replace");
		await replaceDemoAccount(opened.db, accountId, "clerk-mandate-replace");
		const mandates = await opened.db.select().from(schema.mandates).where(eq(schema.mandates.accountId, accountId));
		const accounts = await opened.db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
		assert.equal(mandates.length, 0);
		assert.equal(accounts.length, 1);
	} finally {
		await opened.close();
	}
});

async function applyStatements(client: PGlite): Promise<void> {
	for (const statement of migrationStatements(migrationSql)) {
		await client.exec(statement);
	}
}

test("migration on an empty database and a repeat install the Mandate trigger", async () => {
	const client = new PGlite();
	try {
		await applyStatements(client);
		await applyStatements(client);
		const trigger = await client.query<{ n: number }>(
			"SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'mandates_never_change' AND NOT tgisinternal",
		);
		const cascade = await client.query<{ confdeltype: string }>(
			"SELECT c.confdeltype FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid WHERE t.relname = 'approvals' AND c.conname = 'approvals_account_id_fkey'",
		);
		assert.equal(trigger.rows[0]?.n, 1);
		assert.equal(cascade.rows[0]?.confdeltype, "c");
		const db = drizzlePglite(client, { schema });
		const { approvalId } = await approveAndMandate(db, "mandate-repeat", "clerk-mandate-repeat");
		await refuseSqlChange(db, "mandate-repeat", approvalId);
	} finally {
		await client.close();
	}
});

const connection = process.env.TEST_DATABASE_URL ?? "";

function databaseName(value: string): string {
	return new URL(value).pathname.replace(/^\//, "").split("?")[0] ?? "";
}

function refuseProduction(): void {
	const neon = process.env.NEON_POSTGRES_CONNECTION_STRING;
	if (neon && connection === neon) throw new Error("refusing the Neon connection");
	if (databaseName(connection) === "neondb") throw new Error("refusing the production database");
}

test("the Mandate trigger holds on Postgres", { timeout: 180_000, skip: connection.length === 0 }, async () => {
	refuseProduction();
	const opened = openPostgres(connection);
	const suffix = randomBytes(4).toString("hex");
	const accountId = `mandate-pg-${suffix}`;
	try {
		await opened.migrate();
		await opened.migrate();
		const trigger = (await opened.db.execute(
			sql`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'mandates_never_change' AND NOT tgisinternal`,
		)) as { rows: { n: number }[] };
		const cascade = (await opened.db.execute(
			sql`SELECT c.confdeltype FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid WHERE t.relname = 'approvals' AND c.conname = 'approvals_account_id_fkey'`,
		)) as { rows: { confdeltype: string }[] };
		assert.equal(trigger.rows[0]?.n, 1);
		assert.equal(cascade.rows[0]?.confdeltype, "c");
		const { approvalId, scope, policy, draft } = await approveAndMandate(opened.db, accountId, `clerk-${suffix}`);
		await refuseSqlChange(opened.db, accountId, approvalId);
		await assert.rejects(() => policy.createMandate(scope, draft), /exactly one Mandate/);
		await replaceDemoAccount(opened.db, accountId, `clerk-${suffix}`);
		const replaced = await opened.db.select().from(schema.mandates).where(eq(schema.mandates.accountId, accountId));
		assert.equal(replaced.length, 0);
		await approveAndMandate(opened.db, accountId, `clerk-${suffix}`);
		await deleteAccountChildren(opened.db, accountId);
		await opened.db.delete(schema.accounts).where(eq(schema.accounts.id, accountId));
		const mandates = await opened.db.select().from(schema.mandates).where(eq(schema.mandates.accountId, accountId));
		assert.equal(mandates.length, 0);
	} finally {
		await deleteAccountChildren(opened.db, accountId).catch(() => undefined);
		await opened.db
			.delete(schema.accounts)
			.where(eq(schema.accounts.id, accountId))
			.catch(() => undefined);
		await opened.close();
	}
});
