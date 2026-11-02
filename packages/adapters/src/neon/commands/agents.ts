import type { AccountScope, Autonomy, MissionProposal } from "@tensquads/domain";
import { askRevise as planRevision, requireScope } from "@tensquads/domain";
import { and, eq } from "drizzle-orm";

import { proposalId } from "../../../../domain/src/squads/agent-commands.ts";
import { commitAgentOn } from "../../../../kernel/src/plugins/squads.ts";
import type { MachineProvider } from "../../../../kernel/src/ports.ts";
import { PENDING_TASK_WINDOW_MS } from "../../pending-window.ts";
import { createTestMachine, type MachineRecord } from "../../test-machine.ts";
import { workspaceTransaction } from "../lock.ts";
import type { AppDatabase } from "../postgres.ts";
import { agents, machines, missionProposals, skills } from "../schema.ts";

type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

export type MachineFactory = (rows: readonly MachineRecord[]) => MachineProvider;

const accountChange = "An agent change needs an account.";

function accountIdOf(scope: AccountScope): string {
	const checked = requireScope(scope);
	if (checked.mode !== "account") {
		throw new Error(accountChange);
	}
	return checked.accountId;
}

function machineRecord(agentId: string, on: boolean, row: typeof machines.$inferSelect): MachineRecord {
	return {
		id: agentId,
		on,
		host: row.host,
		region: row.region,
		size: row.size,
		cpu: row.cpu,
		uptime: row.uptime,
		egress: row.egress,
		secrets: row.secrets,
	};
}

async function persistAgentOn(
	tx: Tx,
	accountId: string,
	agentId: string,
	on: boolean,
	createMachine: MachineFactory,
): Promise<void> {
	const agentRows = await tx
		.select()
		.from(agents)
		.where(and(eq(agents.accountId, accountId), eq(agents.id, agentId)));
	const agent = agentRows[0];
	if (!agent) {
		return;
	}
	const machineRows = await tx
		.select()
		.from(machines)
		.where(and(eq(machines.accountId, accountId), eq(machines.agentId, agentId)));
	const machineRow = machineRows[0];
	if (!machineRow) {
		throw new Error(`Agent ${agentId} has no machine.`);
	}
	const machine = createMachine([machineRecord(agentId, agent.isOn, machineRow)]);
	await commitAgentOn(machine, agentId, on, async () => {
		await tx
			.update(agents)
			.set({ isOn: on })
			.where(and(eq(agents.accountId, accountId), eq(agents.id, agentId)));
	});
}

export async function setAgentOn(
	db: AppDatabase,
	scope: AccountScope,
	agentId: string,
	on: boolean,
	createMachine: MachineFactory = createTestMachine,
): Promise<void> {
	const accountId = accountIdOf(scope);
	await workspaceTransaction(
		db,
		async (tx) => {
			await persistAgentOn(tx, accountId, agentId, on, createMachine);
		},
		{ deadlineMs: PENDING_TASK_WINDOW_MS },
	);
}

async function persistSkillOn(tx: Tx, accountId: string, agentId: string, skillId: string, on: boolean): Promise<void> {
	const rows = await tx
		.select()
		.from(skills)
		.where(and(eq(skills.accountId, accountId), eq(skills.agentId, agentId), eq(skills.id, skillId)));
	if (!rows[0]) {
		throw new Error(`No skill ${skillId} for ${agentId}.`);
	}
	await tx
		.update(skills)
		.set({ isOn: on })
		.where(and(eq(skills.accountId, accountId), eq(skills.agentId, agentId), eq(skills.id, skillId)));
}

export async function setSkillOn(
	db: AppDatabase,
	scope: AccountScope,
	agentId: string,
	skillId: string,
	on: boolean,
): Promise<void> {
	const accountId = accountIdOf(scope);
	await workspaceTransaction(
		db,
		async (tx) => {
			await persistSkillOn(tx, accountId, agentId, skillId, on);
		},
		{ deadlineMs: PENDING_TASK_WINDOW_MS },
	);
}

export async function setAutonomy(
	db: AppDatabase,
	scope: AccountScope,
	agentId: string,
	autonomy: Autonomy,
): Promise<void> {
	const accountId = accountIdOf(scope);
	await workspaceTransaction(
		db,
		async (tx) => {
			await tx
				.update(agents)
				.set({ autonomy })
				.where(and(eq(agents.accountId, accountId), eq(agents.id, agentId)));
		},
		{ deadlineMs: PENDING_TASK_WINDOW_MS },
	);
}

function proposalStatus(value: string): MissionProposal["status"] {
	if (value === "Proposed" || value === "Revising" || value === "Approved") {
		return value;
	}
	throw new Error(`The proposal status ${value} is not valid.`);
}

async function insertRevision(tx: Tx, accountId: string, agentId: string, now: number): Promise<void> {
	const agentRows = await tx
		.select()
		.from(agents)
		.where(and(eq(agents.accountId, accountId), eq(agents.id, agentId)));
	const agent = agentRows[0];
	if (!agent) {
		return;
	}
	const stored = await tx.select().from(missionProposals).where(eq(missionProposals.accountId, accountId));
	const proposals = stored.map((row) => ({
		id: row.id,
		agent: row.agent,
		mission: row.mission,
		targets: row.targets,
		status: proposalStatus(row.status),
	}));
	const planned = planRevision(
		{ id: agent.id, mission: agent.mission, targets: agent.targets },
		proposals,
		proposalId(agentId, now),
	);
	if (planned.proposals.length === proposals.length) {
		return;
	}
	const created = planned.proposals[planned.proposals.length - 1];
	if (!created) {
		return;
	}
	const sortOrder = stored.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 1;
	await tx.insert(missionProposals).values({
		accountId,
		id: created.id,
		agent: created.agent,
		mission: created.mission,
		targets: [...created.targets],
		status: created.status,
		sortOrder,
	});
}

export async function askRevise(db: AppDatabase, scope: AccountScope, agentId: string): Promise<void> {
	const accountId = accountIdOf(scope);
	await workspaceTransaction(
		db,
		async (tx) => {
			await insertRevision(tx, accountId, agentId, Date.now());
		},
		{ deadlineMs: PENDING_TASK_WINDOW_MS },
	);
}
