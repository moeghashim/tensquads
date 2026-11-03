import type {
	AccountScope,
	Autonomy,
	Fenced,
	MissionProposal,
	StoredAgentOn,
	StoredAutonomy,
	StoredSkillOn,
	WriteFence,
} from "@tensquads/domain";
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
import { claimWriteFence } from "./write-fence.ts";

type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

export type MachineFactory = (rows: readonly MachineRecord[]) => MachineProvider;

const accountChange = "An agent change needs an account.";
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

async function commitChange<T>(
	db: AppDatabase,
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
		{ deadlineMs: window.remaining },
	);
}

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

async function readAgentOn(tx: Tx, accountId: string, agentId: string): Promise<StoredAgentOn> {
	const rows = await tx
		.select({ id: agents.id, on: agents.isOn })
		.from(agents)
		.where(and(eq(agents.accountId, accountId), eq(agents.id, agentId)));
	const row = rows[0];
	if (!row) {
		throw new Error(`Agent ${agentId} is missing.`);
	}
	return { id: row.id, on: row.on };
}

export async function setAgentOn(
	db: AppDatabase,
	scope: AccountScope,
	agentId: string,
	on: boolean,
	fence: WriteFence,
	createMachine: MachineFactory = createTestMachine,
	deadlineAt?: number,
): Promise<Fenced<StoredAgentOn>> {
	const accountId = accountIdOf(scope);
	return commitChange(db, deadlineAt, async (tx) => {
		const claimed = await claimWriteFence(tx, accountId, `${agentId}:running`, fence);
		if (!claimed) {
			return { status: "superseded", row: await readAgentOn(tx, accountId, agentId) };
		}
		await persistAgentOn(tx, accountId, agentId, on, createMachine);
		return { status: "written", row: await readAgentOn(tx, accountId, agentId) };
	});
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

async function readSkillOn(tx: Tx, accountId: string, agentId: string, skillId: string): Promise<StoredSkillOn> {
	const rows = await tx
		.select({ id: skills.id, on: skills.isOn })
		.from(skills)
		.where(and(eq(skills.accountId, accountId), eq(skills.agentId, agentId), eq(skills.id, skillId)));
	const row = rows[0];
	if (!row) {
		throw new Error(`No skill ${skillId} for ${agentId}.`);
	}
	return { id: row.id, on: row.on };
}

export async function setSkillOn(
	db: AppDatabase,
	scope: AccountScope,
	agentId: string,
	skillId: string,
	on: boolean,
	fence: WriteFence,
	deadlineAt?: number,
): Promise<Fenced<StoredSkillOn>> {
	const accountId = accountIdOf(scope);
	return commitChange(db, deadlineAt, async (tx) => {
		const claimed = await claimWriteFence(tx, accountId, skillId, fence);
		if (!claimed) {
			return { status: "superseded", row: await readSkillOn(tx, accountId, agentId, skillId) };
		}
		await persistSkillOn(tx, accountId, agentId, skillId, on);
		return { status: "written", row: await readSkillOn(tx, accountId, agentId, skillId) };
	});
}

function storedAutonomy(value: string): Autonomy {
	if (value === "Ask first" || value === "Auto under limit" || value === "Full auto") {
		return value;
	}
	throw new Error(`The autonomy ${value} is not valid.`);
}

async function readAutonomy(tx: Tx, accountId: string, agentId: string): Promise<StoredAutonomy> {
	const rows = await tx
		.select({ id: agents.id, autonomy: agents.autonomy })
		.from(agents)
		.where(and(eq(agents.accountId, accountId), eq(agents.id, agentId)));
	const row = rows[0];
	if (!row) {
		throw new Error(`Agent ${agentId} is missing.`);
	}
	return { id: row.id, autonomy: storedAutonomy(row.autonomy) };
}

export async function setAutonomy(
	db: AppDatabase,
	scope: AccountScope,
	agentId: string,
	autonomy: Autonomy,
	fence: WriteFence,
	deadlineAt?: number,
): Promise<Fenced<StoredAutonomy>> {
	const accountId = accountIdOf(scope);
	return commitChange(db, deadlineAt, async (tx) => {
		const claimed = await claimWriteFence(tx, accountId, `${agentId}:autonomy`, fence);
		if (!claimed) {
			return { status: "superseded", row: await readAutonomy(tx, accountId, agentId) };
		}
		await tx
			.update(agents)
			.set({ autonomy })
			.where(and(eq(agents.accountId, accountId), eq(agents.id, agentId)));
		return { status: "written", row: await readAutonomy(tx, accountId, agentId) };
	});
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

export async function askRevise(
	db: AppDatabase,
	scope: AccountScope,
	agentId: string,
	deadlineAt?: number,
): Promise<void> {
	const accountId = accountIdOf(scope);
	await commitChange(db, deadlineAt, (tx) => insertRevision(tx, accountId, agentId, Date.now()));
}
