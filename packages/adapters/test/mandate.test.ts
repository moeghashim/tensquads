import assert from "node:assert/strict";
import test from "node:test";
import { createRepositories, schema } from "@tensquads/adapters";
import type { MandateDraft } from "@tensquads/domain";
import { and, eq } from "drizzle-orm";
import { replaceDemoAccount } from "../../seed/src/demo-account.ts";
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
