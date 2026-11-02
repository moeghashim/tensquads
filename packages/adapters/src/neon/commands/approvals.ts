import type { AccountScope, Approval, MissionProposal, Rule } from "@tensquads/domain";
import {
	decideApproval,
	greetingName,
	limitKeyFor,
	matchedRule,
	decideMission as planMission,
	policyVersion,
	requireScope,
} from "@tensquads/domain";
import { and, asc, eq } from "drizzle-orm";
import { workspaceTransaction } from "../lock.ts";
import type { AppDatabase } from "../postgres.ts";
import { accounts, agents, approvals, missionProposals, rules, stateEntries } from "../schema.ts";
import { appendEvents } from "./bus.ts";
import { createMandate } from "./mandates.ts";

type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

export async function decide(db: AppDatabase, scope: AccountScope, id: string, ok: boolean): Promise<void> {
	const accountId = accountOf(scope);
	await workspaceTransaction(db, async (tx) => {
		const approval = await oneApproval(tx, accountId, id);
		if (approval?.status !== "Pending") return;
		const agent = await oneAgent(tx, accountId, approval.agent);
		if (!agent) throw new Error("The approval names an agent.");
		const at = new Date();
		const name = greetingName(await ownerName(tx, accountId));
		const next = decideApproval({ tasks: agent.tasks, last: agent.lastText }, toApproval(approval), ok);
		await tx
			.update(approvals)
			.set({ status: next.approval.status })
			.where(and(eq(approvals.accountId, accountId), eq(approvals.id, id)));
		if (ok) {
			await tx
				.update(agents)
				.set({ tasks: next.agent.tasks, lastText: next.agent.last })
				.where(and(eq(agents.accountId, accountId), eq(agents.id, agent.id)));
		}
		await appendEvents(
			tx,
			accountId,
			[
				{
					from: "master",
					to: approval.agent,
					kind: ok ? "Approval" : "Declined",
					skill: "-",
					text: `${ok ? "Approved: " : "Declined: "}${approval.title}`,
					payload: { approval_id: approval.id, approved: ok, by: name },
					writes: [`approvals.${approval.id}`],
					set: { [`approvals.${approval.id}`]: ok ? "approved" : "declined" },
				},
			],
			at,
		);
		if (ok) await recordMandate(tx, scope, accountId, approval, name, at);
	});
}

export async function decideMission(db: AppDatabase, scope: AccountScope, id: string, ok: boolean): Promise<void> {
	const accountId = accountOf(scope);
	await workspaceTransaction(db, async (tx) => {
		const proposal = await oneProposal(tx, accountId, id);
		if (proposal?.status !== "Proposed") return;
		const agent = await oneAgent(tx, accountId, proposal.agent);
		if (!agent) throw new Error("The proposal names an agent.");
		const next = planMission(missionAgent(agent), toProposal(proposal), ok);
		await tx
			.update(missionProposals)
			.set({ status: next.proposal.status })
			.where(and(eq(missionProposals.accountId, accountId), eq(missionProposals.id, id)));
		if (!ok) return;
		await tx
			.update(agents)
			.set({
				mission: next.agent.mission,
				targets: next.agent.targets,
				contribution: next.agent.contribution,
			})
			.where(and(eq(agents.accountId, accountId), eq(agents.id, agent.id)));
	});
}

async function recordMandate(
	tx: Tx,
	scope: AccountScope,
	accountId: string,
	approval: { id: string; agent: string },
	name: string,
	at: Date,
): Promise<void> {
	const listed = await listRules(tx, accountId);
	const rule = matchedRule(listed, approval.agent);
	const key = rule ? limitKeyFor(rule) : null;
	if (!rule || !key) throw new Error("An Approval matches a rule.");
	const limitValue = await limitAt(tx, accountId, key);
	await createMandate(tx as unknown as AppDatabase, scope, {
		approvalId: approval.id,
		ruleId: rule.id,
		limitValue,
		policyVersion: policyVersion(listed),
		saidYes: name,
		at,
	});
}

async function limitAt(tx: Tx, accountId: string, key: string): Promise<number> {
	const rows = await tx
		.select({ value: stateEntries.value })
		.from(stateEntries)
		.where(and(eq(stateEntries.accountId, accountId), eq(stateEntries.key, key)));
	const raw = rows[0]?.value;
	if (raw === undefined) throw new Error("An Approval records the limit at that time.");
	const value = JSON.parse(raw) as unknown;
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error("An Approval records the limit at that time.");
	}
	return value;
}

async function listRules(tx: Tx, accountId: string): Promise<readonly Rule[]> {
	const rows = await tx.select().from(rules).where(eq(rules.accountId, accountId)).orderBy(asc(rules.sortOrder));
	return rows.map((row) => ({
		id: row.id,
		when: row.ruleWhen,
		agent: row.agent,
		action: row.action,
		approval: row.approval,
		on: row.isOn,
	}));
}

async function ownerName(tx: Tx, accountId: string): Promise<string> {
	const rows = await tx.select({ owner: accounts.owner }).from(accounts).where(eq(accounts.id, accountId));
	const owner = rows[0]?.owner;
	if (owner === undefined) throw new Error("The account is missing.");
	return owner;
}

async function oneApproval(tx: Tx, accountId: string, id: string) {
	const rows = await tx
		.select()
		.from(approvals)
		.where(and(eq(approvals.accountId, accountId), eq(approvals.id, id)));
	return rows[0];
}

async function oneProposal(tx: Tx, accountId: string, id: string) {
	const rows = await tx
		.select()
		.from(missionProposals)
		.where(and(eq(missionProposals.accountId, accountId), eq(missionProposals.id, id)));
	return rows[0];
}

async function oneAgent(tx: Tx, accountId: string, id: string) {
	const rows = await tx
		.select()
		.from(agents)
		.where(and(eq(agents.accountId, accountId), eq(agents.id, id)));
	return rows[0];
}

function toApproval(row: {
	id: string;
	agent: string;
	title: string;
	detail: string;
	amount: string;
	status: string;
}): Approval {
	return {
		id: row.id,
		agent: row.agent,
		title: row.title,
		detail: row.detail,
		amount: row.amount,
		status: asApproval(row.status),
	};
}

function toProposal(row: {
	id: string;
	agent: string;
	mission: string;
	targets: readonly (readonly [string, string])[];
	status: string;
}): MissionProposal {
	return {
		id: row.id,
		agent: row.agent,
		mission: row.mission,
		targets: row.targets,
		status: asProposal(row.status),
	};
}

function missionAgent(row: {
	mission: string;
	targets: readonly (readonly [string, string, string])[];
	contribution: number;
	tasks: number;
}) {
	return {
		mission: row.mission,
		targets: row.targets,
		contribution: row.contribution,
		tasks: row.tasks,
	};
}

function asApproval(status: string): Approval["status"] {
	if (status === "Pending" || status === "Approved" || status === "Declined") return status;
	throw new Error("The approval status is not valid.");
}

function asProposal(status: string): MissionProposal["status"] {
	if (status === "Proposed" || status === "Revising" || status === "Approved") return status;
	throw new Error("The proposal status is not valid.");
}

function accountOf(scope: AccountScope): string {
	const checked = requireScope(scope);
	if (checked.mode !== "account") throw new Error("An Approval belongs to one account.");
	return checked.accountId;
}
