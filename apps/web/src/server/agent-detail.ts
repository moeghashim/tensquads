import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { AppDatabase } from "@tensquads/adapters";
import type { AccountScope, Agent, Autonomy, BusEvent, SquadsRepository } from "@tensquads/domain";

import { type AgentDetailSource, AUTONOMY_OPTIONS, agentDetailView } from "#/screens/agent-detail/model.ts";

function validateAgentId(input: unknown): string {
	if (typeof input !== "string" || input.length === 0) {
		throw new Error("The agent request is not valid.");
	}
	return input;
}

interface RunningInput {
	readonly agentId: string;
	readonly on: boolean;
}

interface SkillInput {
	readonly agentId: string;
	readonly skillId: string;
	readonly on: boolean;
}

interface AutonomyInput {
	readonly agentId: string;
	readonly autonomy: Autonomy;
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
	return { agentId: input.agentId, on: input.on };
}

function validateSkill(input: unknown): SkillInput {
	if (!isRecord(input) || typeof input.agentId !== "string" || typeof input.skillId !== "string") {
		throw new Error("The agent request is not valid.");
	}
	if (input.agentId.length === 0 || input.skillId.length === 0 || typeof input.on !== "boolean") {
		throw new Error("The agent request is not valid.");
	}
	return { agentId: input.agentId, skillId: input.skillId, on: input.on };
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
	return { agentId: input.agentId, autonomy: input.autonomy };
}

async function withSquads<T>(work: (squads: SquadsRepository, scope: AccountScope) => Promise<T>): Promise<T> {
	const { requireWorkspace } = await import("./workspace-session.ts");
	return requireWorkspace(async (scope, db) => {
		const { createRepositories } = await import("@tensquads/adapters");
		return work(createRepositories(db).squads, scope);
	});
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
	shown: Pick<AgentDetailSource, "host" | "region" | "size" | "cpu" | "uptime" | "egress" | "secrets">,
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

async function loadView(db: AppDatabase, scope: AccountScope, agentId: string) {
	const { createRepositories, createTestMachine } = await import("@tensquads/adapters");
	const repos = createRepositories(db);
	const agents = await repos.squads.listAgents(scope);
	const agent = agents.find((item) => item.id === agentId);
	if (!agent) {
		return null;
	}
	const machine = createTestMachine([machineRecord(agent)]);
	const master = await repos.squads.master(scope);
	const accounts = await repos.platform.listAccounts(scope);
	const company = accounts.find((item) => item.id === scope.accountId);
	const events = await repos.bus.listEvents(scope);
	const shown = {
		host: machine.host(agent.id),
		region: machine.region(agent.id),
		size: machine.size(agent.id),
		cpu: machine.cpu(agent.id),
		uptime: machine.uptime(agent.id),
		egress: machine.egress(agent.id),
		secrets: machine.secrets(agent.id),
	};
	return agentDetailView(
		detailSource(agent, shown, events, agentNames(agents), master?.name ?? "Master", company?.mission ?? ""),
	);
}

export const loadAgentDetail = createServerFn({ method: "GET" })
	.validator(validateAgentId)
	.handler(async ({ data }) => {
		const { requireWorkspace } = await import("./workspace-session.ts");
		const view = await requireWorkspace((scope, db) => loadView(db, scope, data));
		if (!view) {
			throw redirect({ to: "/agents" });
		}
		return view;
	});

export const setAgentRunning = createServerFn({ method: "POST" })
	.validator(validateRunning)
	.handler(async ({ data }) => {
		await withSquads((squads, scope) => squads.setAgentOn(scope, data.agentId, data.on));
	});

export const setSkillEnabled = createServerFn({ method: "POST" })
	.validator(validateSkill)
	.handler(async ({ data }) => {
		await withSquads((squads, scope) => squads.setSkillOn(scope, data.agentId, data.skillId, data.on));
	});

export const setAgentAutonomy = createServerFn({ method: "POST" })
	.validator(validateAutonomy)
	.handler(async ({ data }) => {
		await withSquads((squads, scope) => squads.setAutonomy(scope, data.agentId, data.autonomy));
	});

export const askAgentRevise = createServerFn({ method: "POST" })
	.validator(validateAgentId)
	.handler(async ({ data }) => {
		await withSquads((squads, scope) => squads.askRevise(scope, data));
	});
