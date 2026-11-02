import assert from "node:assert/strict";
import test from "node:test";
import { createRepositories, schema } from "@tensquads/adapters";
import type { MandateDraft } from "@tensquads/domain";
import { eq } from "drizzle-orm";
import { replaceDemoAccount } from "../../seed/src/demo-account.ts";
import { openPglite } from "./pglite.ts";

const scope = { accountId: "rules-account", mode: "account" as const };

test("setLimit changes the value bus.readStore returns and writes no event", async () => {
	const { db, close } = await openPglite();
	try {
		await replaceDemoAccount(db, scope.accountId, "clerk-rules");
		const repositories = createRepositories(db);
		const before = await repositories.bus.listEvents(scope);
		assert.deepEqual(await repositories.policy.setLimit(scope, "policy.refund_auto_limit", 55), {
			key: "policy.refund_auto_limit",
			value: 55,
		});
		const store = await repositories.bus.readStore(scope);
		assert.equal(store["policy.refund_auto_limit"], 55);
		assert.equal(store["policy.daily_ad_cap"], 200);
		assert.equal(store["policy.reorder_limit"], 500);
		const after = await repositories.bus.listEvents(scope);
		assert.equal(after.length, before.length);
		await assert.rejects(
			() => repositories.policy.setLimit(scope, "policy.refund_auto_limit", 51),
			/The limit is not valid/,
		);
		await assert.rejects(() => repositories.policy.setLimit(scope, "policy.other", 50), /The limit is not valid/);
		const again = await repositories.bus.readStore(scope);
		assert.equal(again["policy.refund_auto_limit"], 55);
	} finally {
		await close();
	}
});

test("a blank action adds no rule and a new rule is on and last", async () => {
	const { db, close } = await openPglite();
	try {
		await replaceDemoAccount(db, scope.accountId, "clerk-rules-add");
		const policy = createRepositories(db).policy;
		const before = await policy.listRules(scope);
		assert.equal(
			await policy.addRule(scope, {
				when: "A new order arrives",
				agent: "orders",
				action: "   ",
				approval: "Ask first",
			}),
			null,
		);
		assert.equal((await policy.listRules(scope)).length, before.length);
		assert.deepEqual(
			await policy.addRule(scope, {
				when: "A new order arrives",
				agent: "support",
				action: " email them ",
				approval: "Auto",
			}),
			{
				id: "r100",
				when: "a new order arrives",
				agent: "support",
				action: "email them",
				approval: "Auto",
				on: true,
			},
		);
		const after = await policy.listRules(scope);
		assert.equal(after.length, before.length + 1);
		const added = after[after.length - 1];
		assert.ok(added);
		assert.equal(added.id, "r100");
		assert.equal(added.when, "a new order arrives");
		assert.equal(added.agent, "support");
		assert.equal(added.action, "email them");
		assert.equal(added.approval, "Auto");
		assert.equal(added.on, true);
		assert.deepEqual(
			after.slice(0, before.length).map((rule) => rule.id),
			before.map((rule) => rule.id),
		);
	} finally {
		await close();
	}
});

test("a rule switch changes only that rule", async () => {
	const { db, close } = await openPglite();
	try {
		await replaceDemoAccount(db, scope.accountId, "clerk-rules-switch");
		const policy = createRepositories(db).policy;
		assert.equal((await policy.setRuleOn(scope, "r5", true)).on, true);
		const rules = await policy.listRules(scope);
		assert.equal(rules.find((rule) => rule.id === "r5")?.on, true);
		assert.equal(rules.find((rule) => rule.id === "r1")?.on, true);
		assert.equal(
			rules.find((rule) => rule.id === "r1")?.action,
			"refund it if it is under the refund limit, otherwise ask me",
		);
		await assert.rejects(() => policy.setRuleOn(scope, "missing", false), /The rule is missing/);
		await assert.rejects(
			() => policy.setLimit({ accountId: "platform", mode: "platform" }, "policy.daily_ad_cap", 200),
			/A rule change needs an account/,
		);
	} finally {
		await close();
	}
});

test("a new account has no rules", async () => {
	const { db, close } = await openPglite();
	try {
		const repositories = createRepositories(db);
		const account = { accountId: "empty-rules", mode: "account" as const };
		await repositories.platform.createWorkspace(account, {
			clerkUserId: "clerk-empty-rules",
			email: "owner@example.com",
			name: "Harbor Coffee",
			mission: "Reach 500 paying customers in year one",
			agents: [{ id: "orders", name: "Orders", role: "Fulfilment and tracking", tint: "#e7efff" }],
		});
		assert.deepEqual(await repositories.policy.listRules(account), []);
		const store = await repositories.bus.readStore(account);
		assert.equal(store["policy.daily_ad_cap"], 200);
	} finally {
		await close();
	}
});

test("a later rule or limit change does not change an existing Mandate", async () => {
	const { db, close } = await openPglite();
	try {
		await replaceDemoAccount(db, scope.accountId, "clerk-rules-mandate");
		const policy = createRepositories(db).policy;
		const rule = (await policy.listRules(scope))[0];
		const pending = (await policy.listApprovals(scope)).find((item) => item.status === "Pending");
		assert.ok(rule);
		assert.ok(pending);
		const approvalId = "rules-mandate-approval";
		await db.insert(schema.approvals).values({
			accountId: scope.accountId,
			id: approvalId,
			agent: pending.agent,
			title: pending.title,
			detail: pending.detail,
			amount: pending.amount,
			status: "Approved",
			sortOrder: 40,
		});
		const draft: MandateDraft = {
			approvalId,
			ruleId: rule.id,
			limitValue: 40,
			policyVersion: "policy-1",
			saidYes: "owner",
			at: new Date("2026-11-02T12:00:00.000Z"),
		};
		const made = await policy.createMandate(scope, draft);
		await policy.setRuleOn(scope, rule.id, !rule.on);
		await policy.addRule(scope, {
			when: "A customer leaves a bad review",
			agent: "support",
			action: "draft a reply",
			approval: "Ask first",
		});
		await policy.setLimit(scope, "policy.refund_auto_limit", 40);
		const changed = await policy.listRules(scope);
		assert.equal(changed.find((item) => item.id === rule.id)?.on, !rule.on);
		assert.equal((await createRepositories(db).bus.readStore(scope))["policy.refund_auto_limit"], 40);
		const again = await policy.mandate(scope, approvalId);
		assert.deepEqual(again, made);
		const row = await db.select().from(schema.mandates).where(eq(schema.mandates.approvalId, approvalId));
		assert.equal(row[0]?.ruleAction, rule.action);
		assert.equal(row[0]?.ruleWhen, rule.when);
		assert.equal(row[0]?.limitValue, 40);
	} finally {
		await close();
	}
});
