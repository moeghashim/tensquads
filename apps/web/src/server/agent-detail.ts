import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { AppDatabase } from "@tensquads/adapters";
import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";
import type { AccountScope, Agent, Autonomy, BusEvent, Fenced, StoredAgentOn } from "@tensquads/domain";
import { Kernel } from "@tensquads/kernel";

import {
	type AgentDetailSource,
	type AgentDetailView,
	AUTONOMY_OPTIONS,
	agentDetailView,
} from "#/screens/agent-detail/model.ts";
import { machineEnv } from "./machine-env.ts";
import { workerEnv } from "./worker-env.ts";

function validateAgentId(input: unknown): string {
	if (typeof input !== "string" || input.length === 0) {
		throw new Error("The agent request is not valid.");
	}
	return input;
}

interface FenceInput {
	readonly tab: string;
	readonly seq: number;
	readonly retires: readonly string[];
}

interface RunningInput extends FenceInput {
	readonly agentId: string;
	readonly on: boolean;
	readonly accountId: string;
}

interface SkillInput extends FenceInput {
	readonly agentId: string;
	readonly skillId: string;
	readonly on: boolean;
	readonly accountId: string;
}

interface AutonomyInput extends FenceInput {
	readonly agentId: string;
	readonly autonomy: Autonomy;
	readonly accountId: string;
}

interface AgentWrite<T> {
	readonly status: "written" | "superseded";
	readonly row: T;
}

function isRecord(input: unknown): input is Record<string, unknown> {
	return typeof input === "object" && input !== null;
}

function validateRunning(input: unknown): RunningInput {
	if (!isRecord(input) || typeof input.agentId !== "string" || input.agentId.length === 0) {
		throw new Error("The agent request is not valid.");
	}
	if (typeof input.on !== "boolean") {
		throw new Error("The agent request is not valid.");
	}
	const fence = validateFence(input);
	return { agentId: input.agentId, on: input.on, ...fence, ...displayedAccount(input) };
}

function validateSkill(input: unknown): SkillInput {
	if (!isRecord(input) || typeof input.agentId !== "string" || typeof input.skillId !== "string") {
		throw new Error("The agent request is not valid.");
	}
	if (input.agentId.length === 0 || input.skillId.length === 0 || typeof input.on !== "boolean") {
		throw new Error("The agent request is not valid.");
	}
	const fence = validateFence(input);
	return { agentId: input.agentId, skillId: input.skillId, on: input.on, ...fence, ...displayedAccount(input) };
}

function isAutonomy(value: string): value is Autonomy {
	for (const option of AUTONOMY_OPTIONS) {
		if (option === value) {
			return true;
		}
	}
	return false;
}

function validateAutonomy(input: unknown): AutonomyInput {
	if (!isRecord(input) || typeof input.agentId !== "string" || input.agentId.length === 0) {
		throw new Error("The agent request is not valid.");
	}
	if (typeof input.autonomy !== "string" || !isAutonomy(input.autonomy)) {
		throw new Error("The agent request is not valid.");
	}
	const fence = validateFence(input);
	return { agentId: input.agentId, autonomy: input.autonomy, ...fence, ...displayedAccount(input) };
}

function displayedAccount(input: Record<string, unknown>): { readonly accountId: string } {
	if (typeof input.accountId !== "string" || input.accountId.length === 0) {
		throw new Error("The agent request is not valid.");
	}
	return { accountId: input.accountId };
}

function validateRevise(input: unknown): { readonly agentId: string; readonly accountId: string } {
	if (!isRecord(input)) throw new Error("The agent request is not valid.");
	return { agentId: validateAgentId(input.agentId), ...displayedAccount(input) };
}

function validateFence(input: Record<string, unknown>): FenceInput {
	const { tab, seq } = input;
	if (typeof tab !== "string" || tab.length === 0 || tab.length > 80 || tab !== tab.trim()) {
		throw new Error("The write fence is not valid.");
	}
	if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 1) {
		throw new Error("The write fence is not valid.");
	}
	return { tab, seq, retires: validateRetires(input.retires) };
}

function validateRetires(input: unknown): readonly string[] {
	if (input === undefined) return [];
	if (!Array.isArray(input) || input.length > 8) {
		throw new Error("The write fence is not valid.");
	}
	const retires: string[] = [];
	for (const id of input) {
		if (typeof id !== "string" || id.length === 0 || id.length > 80 || id !== id.trim()) {
			throw new Error("The write fence is not valid.");
		}
		if (!retires.includes(id)) retires.push(id);
	}
	return retires;
}

const unfinished = "The workspace write did not finish.";

type KernelRun<T> = (kernel: Kernel, scope: AccountScope, deadlineAt: number) => Promise<T>;

function throwIfLate(deadlineAt: number): void {
	if (Date.now() >= deadlineAt) throw new Error(unfinished);
}

async function commitAgentWrite<T>(
	agentId: string,
	accountId: string,
	run: KernelRun<T>,
): Promise<{ readonly result: T; readonly view: AgentDetailView }> {
	const startedAt = Date.now();
	const deadlineAt = startedAt + PENDING_TASK_WINDOW_MS;
	const { requireWorkspace } = await import("./workspace-session.ts");
	return requireWorkspace((scope, db) => finishAgentWrite(scope, db, agentId, deadlineAt, run), {
		accountId,
		startedAt,
	});
}

async function finishAgentWrite<T>(
	scope: AccountScope,
	db: AppDatabase,
	agentId: string,
	deadlineAt: number,
	run: KernelRun<T>,
): Promise<{ readonly result: T; readonly view: AgentDetailView }> {
	throwIfLate(deadlineAt);
	const { createRepositories } = await import("@tensquads/adapters");
	const result = await run(new Kernel(createRepositories(db)), scope, deadlineAt);
	throwIfLate(deadlineAt);
	const loaded = await loadView(db, scope, agentId);
	throwIfLate(deadlineAt);
	return { result, view: { ...loaded, accountId: scope.accountId } };
}

async function writeFenced(
	agentId: string,
	accountId: string,
	run: KernelRun<{ readonly status: "written" | "superseded" }>,
): Promise<AgentWrite<AgentDetailView>> {
	const written = await commitAgentWrite(agentId, accountId, run);
	return { status: written.result.status, row: written.view };
}

async function writeThroughKernel(agentId: string, accountId: string, run: KernelRun<void>): Promise<AgentDetailView> {
	const written = await commitAgentWrite(agentId, accountId, run);
	return written.view;
}

function machineRecord(agent: Agent) {
	return {
		id: agent.id,
		on: agent.on,
		host: agent.host,
		region: agent.region,
		size: agent.size,
		cpu: agent.cpu,
		uptime: agent.uptime,
		egress: agent.egress,
		secrets: agent.secrets,
	};
}

function agentNames(agents: readonly Agent[]): Record<string, string> {
	const names: Record<string, string> = {};
	for (const agent of agents) {
		names[agent.id] = agent.name;
	}
	return names;
}

function agentEvents(events: readonly BusEvent[], agentId: string): AgentDetailSource["events"] {
	return events
		.filter((event) => event.from === agentId || event.to === agentId)
		.slice()
		.reverse()
		.map((event) => ({
			id: event.id,
			time: event.time,
			kind: event.kind,
			from: event.from,
			to: event.to,
			text: event.text,
		}));
}

function detailSource(
	agent: Agent,
	shown: Pick<
		AgentDetailSource,
		"host" | "region" | "size" | "cpu" | "uptime" | "storedCpu" | "storedUptime" | "egress" | "secrets"
	>,
	events: readonly BusEvent[],
	names: Readonly<Record<string, string>>,
	masterName: string,
	companyMission: string,
): AgentDetailSource {
	return {
		id: agent.id,
		name: agent.name,
		role: agent.role,
		tint: agent.tint,
		on: agent.on,
		autonomy: agent.autonomy,
		mission: agent.mission,
		targets: agent.targets,
		contribution: agent.contribution,
		kpis: agent.kpis,
		skills: agent.skills,
		...shown,
		events: agentEvents(events, agent.id),
		masterName,
		companyMission,
		names,
	};
}

async function liveDashboard(scope: AccountScope, agentId: string) {
	const { chooseAdapters, readLiveMachine } = await import("@tensquads/adapters");
	if (chooseAdapters(await workerEnv("ADAPTERS")) !== "real") return null;
	if (agentId !== "market" && agentId !== "website") return null;
	try {
		return await readLiveMachine(await machineEnv(), scope, agentId);
	} catch {
		return { host: "—", cpu: "—", uptime: "—" };
	}
}

async function loadView(db: AppDatabase, scope: AccountScope, agentId: string) {
	const { createRepositories, createTestMachine } = await import("@tensquads/adapters");
	const repos = createRepositories(db);
	const agents = await repos.squads.listAgents(scope);
	const agent = agents.find((item) => item.id === agentId);
	if (!agent) {
		throw redirect({ to: "/agents" });
	}
	const machine = createTestMachine([machineRecord(agent)]);
	const live = agent.on ? await liveDashboard(scope, agent.id) : null;
	const master = await repos.squads.master(scope);
	const accounts = await repos.platform.listAccounts(scope);
	const company = accounts.find((item) => item.id === scope.accountId);
	const events = await repos.bus.listEvents(scope);
	const shown = {
		host: live?.host ?? machine.host(agent.id),
		region: machine.region(agent.id),
		size: machine.size(agent.id),
		cpu: agent.on ? (live?.cpu ?? machine.cpu(agent.id)) : "0%",
		uptime: agent.on ? (live?.uptime ?? machine.uptime(agent.id)) : "Paused",
		storedCpu: agent.cpu,
		storedUptime: agent.uptime,
		egress: machine.egress(agent.id),
		secrets: machine.secrets(agent.id),
	};
	return agentDetailView(
		detailSource(agent, shown, events, agentNames(agents), master?.name ?? "Petra", company?.mission ?? ""),
	);
}

export const loadAgentDetail = createServerFn({ method: "GET" })
	.validator(validateAgentId)
	.handler(async ({ data }) => {
		const { requireWorkspace } = await import("./workspace-session.ts");
		return requireWorkspace(async (scope, db) => {
			const view = await loadView(db, scope, data);
			return { ...view, accountId: scope.accountId };
		});
	});

export const setAgentRunning = createServerFn({ method: "POST" })
	.validator(validateRunning)
	.handler(async ({ data }) => {
		return writeFenced(data.agentId, data.accountId, (kernel, scope, deadlineAt) =>
			switchMachineThen(data.agentId, scope, () =>
				kernel.setAgentOn(
					scope,
					data.agentId,
					data.on,
					{ tab: data.tab, seq: data.seq, retires: data.retires },
					deadlineAt,
				),
			),
		);
	});

// In real mode the stored switch commits first, then the agent's boat.dev machine moves
// to the stored value. Test mode has no machine, so it only writes.
async function switchMachineThen(
	agentId: string,
	scope: AccountScope,
	persist: () => Promise<Fenced<StoredAgentOn>>,
): Promise<Fenced<StoredAgentOn>> {
	const { switchAgentMachine, switchingMachine } = await import("@tensquads/adapters");
	const machine = switchingMachine(await machineEnv(), agentId);
	return switchAgentMachine(machine, scope, agentId, persist);
}

export const setSkillEnabled = createServerFn({ method: "POST" })
	.validator(validateSkill)
	.handler(async ({ data }) => {
		return writeFenced(data.agentId, data.accountId, (kernel, scope, deadlineAt) =>
			kernel.setSkillOn(
				scope,
				data.agentId,
				data.skillId,
				data.on,
				{ tab: data.tab, seq: data.seq, retires: data.retires },
				deadlineAt,
			),
		);
	});

export const setAgentAutonomy = createServerFn({ method: "POST" })
	.validator(validateAutonomy)
	.handler(async ({ data }) => {
		return writeFenced(data.agentId, data.accountId, (kernel, scope, deadlineAt) =>
			kernel.setAutonomy(
				scope,
				data.agentId,
				data.autonomy,
				{ tab: data.tab, seq: data.seq, retires: data.retires },
				deadlineAt,
			),
		);
	});

export const askAgentRevise = createServerFn({ method: "POST" })
	.validator(validateRevise)
	.handler(async ({ data }) => {
		return writeThroughKernel(data.agentId, data.accountId, (kernel, scope, deadlineAt) =>
			kernel.askRevise(scope, data.agentId, deadlineAt),
		);
	});
