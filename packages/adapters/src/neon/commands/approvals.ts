import type { AccountScope, Approval, MissionProposal, Rule, WrittenDecision } from "@tensquads/domain";
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
import { chooseAdapters } from "../../adapter-choice.ts";
import { PENDING_TASK_WINDOW_MS } from "../../pending-window.ts";
import { workspaceTransaction } from "../lock.ts";
import type { AppDatabase } from "../postgres.ts";
import { accounts, agents, approvals, missionProposals, rules, stateEntries } from "../schema.ts";
import { type DeliverUserEvent, deliverUserToMaster, userMasterEvent } from "./approval-bus.ts";
import { appendEvents } from "./bus.ts";
import { createMandate } from "./mandates.ts";

type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

const unfinished = "The workspace write did not finish.";

function deadlineWindow(deadlineAt: number | undefined): { readonly absolute: number; readonly remaining: number } {
	const absolute = deadlineAt ?? Date.now() + PENDING_TASK_WINDOW_MS;
	const remaining = absolute - Date.now();
	// A lock_timeout of 0 waits forever, so a few milliseconds left is already late.
	if (remaining < 4) {
		throw new Error(unfinished);
	}
	return { absolute, remaining };
}

async function commitDecision<T>(
	db: AppDatabase,
	accountId: string,
	deadlineAt: number | undefined,
	work: (tx: Tx) => Promise<T>,
): Promise<T> {
	const window = deadlineWindow(deadlineAt);
	return workspaceTransaction(
		db,
		async (tx, constrainDeadline) => {
			constrainDeadline(window.absolute);
			return work(tx);
		},
		{ deadlineMs: window.remaining, accountId },
	);
}

export async function decide(
	db: AppDatabase,
	scope: AccountScope,
	id: string,
	ok: boolean,
	deadlineAt?: number,
	deliver: DeliverUserEvent = deliverUserToMaster,
): Promise<WrittenDecision> {
	const accountId = accountOf(scope);
	return commitDecision(db, accountId, deadlineAt, async (tx) => {
		const approval = await oneApproval(tx, accountId, id);
		if (approval?.status !== "Pending") {
			return { id, status: approval?.status ?? "Pending", count: await countInbox(tx, accountId) };
		}
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
		if (chooseAdapters(process.env.ADAPTERS) === "real") {
			await deliver(accountId, userMasterEvent({ id: approval.id, ok, title: approval.title, by: name, at }));
		} else {
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
		}
		if (ok) await recordMandate(tx, scope, accountId, approval, name, at);
		return { id, status: next.approval.status, count: await countInbox(tx, accountId) };
	});
}

export async function decideMission(
	db: AppDatabase,
	scope: AccountScope,
	id: string,
	ok: boolean,
	deadlineAt?: number,
): Promise<WrittenDecision> {
	const accountId = accountOf(scope);
	return commitDecision(db, accountId, deadlineAt, async (tx) => {
		const proposal = await oneProposal(tx, accountId, id);
		if (proposal?.status !== "Proposed") {
			return { id, status: proposal?.status ?? "Proposed", count: await countInbox(tx, accountId) };
		}
		const agent = await oneAgent(tx, accountId, proposal.agent);
		if (!agent) throw new Error("The proposal names an agent.");
		const next = planMission(missionAgent(agent), toProposal(proposal), ok);
		await tx
			.update(missionProposals)
			.set({ status: next.proposal.status })
			.where(and(eq(missionProposals.accountId, accountId), eq(missionProposals.id, id)));
		if (ok) {
			await tx
				.update(agents)
				.set({
					mission: next.agent.mission,
					targets: next.agent.targets,
					contribution: next.agent.contribution,
				})
				.where(and(eq(agents.accountId, accountId), eq(agents.id, agent.id)));
		}
		return { id, status: next.proposal.status, count: await countInbox(tx, accountId) };
	});
}

async function countInbox(tx: Tx, accountId: string): Promise<number> {
	const pending = await tx
		.select({ id: approvals.id })
		.from(approvals)
		.where(and(eq(approvals.accountId, accountId), eq(approvals.status, "Pending")));
	const proposed = await tx
		.select({ id: missionProposals.id })
		.from(missionProposals)
		.where(and(eq(missionProposals.accountId, accountId), eq(missionProposals.status, "Proposed")));
	return pending.length + proposed.length;
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
