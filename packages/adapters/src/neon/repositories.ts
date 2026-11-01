import {
	type Account,
	type AccountScope,
	type AccountStatus,
	type Agent,
	type AgentImage,
	type Approval,
	type ApprovalStatus,
	type Autonomy,
	type Bug,
	type BusEvent,
	type BusKind,
	type CatalogCounts,
	type DailyRevenue,
	EMPTY_INBOX,
	type FeatureRequest,
	type FeatureStage,
	type ImageStatus,
	type Inbox,
	inboxCount,
	inboxIsEmpty,
	type Message,
	type MessageFrom,
	type MissionProposal,
	type MissionProposalStatus,
	type OverviewTile,
	type Plan,
	type PlanName,
	type PlatformTotals,
	type RepositoryBag,
	type Rule,
	requireScope,
	type Severity,
	type SkillGate,
	type Thread,
} from "@tensquads/domain";
import { asc, eq } from "drizzle-orm";

import { createWorkspace } from "./create-workspace.ts";
import type { AppDatabase } from "./postgres.ts";
import {
	accounts,
	agentImages,
	agents,
	approvals,
	bugs,
	busEvents,
	dailyRevenue,
	featureRequests,
	machines,
	masters,
	messages,
	missionProposals,
	overviewTiles,
	plans,
	rules,
	skills,
	squads,
	stateEntries,
	subscriptions,
	threads,
} from "./schema.ts";

export function createRepositories(db: AppDatabase): RepositoryBag {
	return {
		platform: {
			listAccounts: (scope) => listAccounts(db, scope),
			totals: (scope) => totals(db, scope),
			listPlans: (scope) => listPlans(db, scope),
			overviewTiles: (scope) => listTiles(db, scope),
			dailyRevenue: (scope) => listRevenue(db, scope),
			createWorkspace: (scope, draft) => createWorkspace(db, scope, draft),
		},
		squads: {
			listSquads: (scope) => listSquads(db, scope),
			listAgents: (scope) => listAgents(db, scope),
			master: (scope) => readMaster(db, scope),
			tasksDone: (scope) => tasksDone(db, scope),
		},
		bus: {
			listEvents: (scope) => listEvents(db, scope),
			readStore: (scope) => readStore(db, scope),
		},
		policy: {
			listRules: (scope) => listRules(db, scope),
			listApprovals: (scope) => listApprovals(db, scope),
			listMissionProposals: (scope) => listProposals(db, scope),
			inbox: (scope) => readInbox(db, scope),
		},
		catalog: {
			listImages: (scope) => listImages(db, scope),
			counts: (scope) => catalogCounts(db, scope),
		},
		conversation: {
			thread: (scope) => readThread(db, scope),
		},
	};
}

async function listAccounts(db: AppDatabase, scope: AccountScope): Promise<readonly Account[]> {
	const checked = requireScope(scope);
	const accountRows =
		checked.mode === "platform"
			? await db.select().from(accounts).orderBy(asc(accounts.sortOrder))
			: await db
					.select()
					.from(accounts)
					.where(eq(accounts.accountId, checked.accountId))
					.orderBy(asc(accounts.sortOrder));
	const squadRows =
		checked.mode === "platform"
			? await db.select().from(squads).orderBy(asc(squads.sortOrder))
			: await db.select().from(squads).where(eq(squads.accountId, checked.accountId)).orderBy(asc(squads.sortOrder));
	const subscriptionRows =
		checked.mode === "platform"
			? await db.select().from(subscriptions).orderBy(asc(subscriptions.sortOrder))
			: await db
					.select()
					.from(subscriptions)
					.where(eq(subscriptions.accountId, checked.accountId))
					.orderBy(asc(subscriptions.sortOrder));
	const names = new Map<string, string[]>();
	for (const row of squadRows) {
		const list = names.get(row.accountId) ?? [];
		list.push(row.name);
		names.set(row.accountId, list);
	}
	const byAccount = new Map(subscriptionRows.map((row) => [row.accountId, row]));
	return accountRows.map((row) => {
		const subscription = byAccount.get(row.id);
		if (!subscription) {
			throw new Error(`Account ${row.id} has no subscription.`);
		}
		return {
			id: row.id,
			name: row.name,
			owner: row.owner,
			email: row.email,
			plan: asPlan(subscription.plan),
			tint: row.tint,
			squads: names.get(row.id) ?? [],
			agents: row.agents,
			online: row.online,
			tasks: row.tasks,
			lastActive: row.lastActive,
			status: asStatus(subscription.status),
			createdWeek: row.createdWeek,
			started: subscription.started,
			mrr: subscription.mrr,
			ltv: subscription.ltv,
			mission: row.mission,
		};
	});
}

async function totals(db: AppDatabase, scope: AccountScope): Promise<PlatformTotals> {
	const accountRows = await listAccounts(db, scope);
	const agentRows = await agentTaskRows(db, scope);
	const squadRows = await listSquads(db, scope);
	const catalog = await catalogCounts(db, scope);
	return {
		accounts: accountRows.length,
		agents: accountRows.reduce((sum, row) => sum + row.agents, 0),
		squads: squadRows.length,
		mrr: accountRows.reduce((sum, row) => sum + row.mrr, 0),
		allTime: accountRows.reduce((sum, row) => sum + row.ltv, 0),
		tasksDone: agentRows.reduce((sum, row) => sum + row.tasks, 0),
		images: catalog.images,
		openBugs: catalog.openBugs,
		featuresRequested: catalog.featuresRequested,
	};
}

async function listPlans(db: AppDatabase, scope: AccountScope): Promise<readonly Plan[]> {
	requireScope(scope);
	const rows = await db.select().from(plans).orderBy(asc(plans.sortOrder));
	return rows.map((row) => ({ id: asPlan(row.id), name: asPlan(row.name), monthly: row.monthly }));
}

async function listTiles(db: AppDatabase, scope: AccountScope): Promise<readonly OverviewTile[] | null> {
	const checked = requireScope(scope);
	if (checked.mode === "platform") {
		return null;
	}
	const rows = await db.select().from(overviewTiles).where(eq(overviewTiles.accountId, checked.accountId));
	return rows[0]?.tiles ?? null;
}

async function listRevenue(db: AppDatabase, scope: AccountScope): Promise<readonly DailyRevenue[]> {
	const checked = requireScope(scope);
	const query =
		checked.mode === "platform"
			? db.select().from(dailyRevenue)
			: db.select().from(dailyRevenue).where(eq(dailyRevenue.accountId, checked.accountId));
	const rows = await query.orderBy(asc(dailyRevenue.sortOrder));
	return rows.map((row) => ({ day: row.day, amount: row.amount }));
}

async function listSquads(db: AppDatabase, scope: AccountScope) {
	const checked = requireScope(scope);
	const rows =
		checked.mode === "platform"
			? await db.select().from(squads).orderBy(asc(squads.sortOrder))
			: await db.select().from(squads).where(eq(squads.accountId, checked.accountId)).orderBy(asc(squads.sortOrder));
	return rows.map((row) => ({ id: row.id, accountId: row.accountId, name: row.name }));
}

async function listAgents(db: AppDatabase, scope: AccountScope): Promise<readonly Agent[]> {
	const checked = requireScope(scope);
	const agentRows = await agentTaskRows(db, checked);
	const machineRows =
		checked.mode === "platform"
			? await db.select().from(machines).orderBy(asc(machines.sortOrder))
			: await db
					.select()
					.from(machines)
					.where(eq(machines.accountId, checked.accountId))
					.orderBy(asc(machines.sortOrder));
	const skillRows =
		checked.mode === "platform"
			? await db.select().from(skills).orderBy(asc(skills.sortOrder))
			: await db.select().from(skills).where(eq(skills.accountId, checked.accountId)).orderBy(asc(skills.sortOrder));
	const machineByAgent = new Map(machineRows.map((row) => [`${row.accountId}:${row.agentId}`, row]));
	const skillsByAgent = new Map<string, Agent["skills"][number][]>();
	for (const row of skillRows) {
		const key = `${row.accountId}:${row.agentId}`;
		const list = skillsByAgent.get(key) ?? [];
		list.push({
			id: row.id,
			desc: row.description,
			gate: asGate(row.gate),
			runs: row.runs,
			on: row.isOn,
		});
		skillsByAgent.set(key, list);
	}
	return agentRows.map((row) => {
		const machine = machineByAgent.get(`${row.accountId}:${row.id}`);
		if (!machine) {
			throw new Error(`Agent ${row.id} has no machine.`);
		}
		return {
			id: row.id,
			name: row.name,
			role: row.role,
			tint: row.tint,
			on: row.isOn,
			autonomy: asAutonomy(row.autonomy),
			mission: row.mission,
			targets: row.targets,
			contribution: row.contribution,
			tasks: row.tasks,
			success: row.success,
			saved: row.saved,
			last: row.lastText,
			host: machine.host,
			region: machine.region,
			size: machine.size,
			cpu: machine.cpu,
			uptime: machine.uptime,
			egress: machine.egress,
			secrets: machine.secrets,
			kpis: row.kpis,
			skills: skillsByAgent.get(`${row.accountId}:${row.id}`) ?? [],
		};
	});
}

async function agentTaskRows(db: AppDatabase, scope: AccountScope) {
	const checked = requireScope(scope);
	if (checked.mode === "platform") {
		return db.select().from(agents).orderBy(asc(agents.sortOrder));
	}
	return db.select().from(agents).where(eq(agents.accountId, checked.accountId)).orderBy(asc(agents.sortOrder));
}

async function tasksDone(db: AppDatabase, scope: AccountScope): Promise<number> {
	const rows = await agentTaskRows(db, scope);
	return rows.reduce((sum, row) => sum + row.tasks, 0);
}

async function readMaster(db: AppDatabase, scope: AccountScope) {
	const checked = requireScope(scope);
	if (checked.mode !== "account") {
		return null;
	}
	const rows = await db
		.select()
		.from(masters)
		.where(eq(masters.accountId, checked.accountId))
		.orderBy(asc(masters.sortOrder));
	const row = rows[0];
	return row ? { accountId: row.accountId, name: row.name } : null;
}

async function listEvents(db: AppDatabase, scope: AccountScope): Promise<readonly BusEvent[]> {
	const checked = requireScope(scope);
	const rows =
		checked.mode === "platform"
			? await db.select().from(busEvents).orderBy(asc(busEvents.seq))
			: await db
					.select()
					.from(busEvents)
					.where(eq(busEvents.accountId, checked.accountId))
					.orderBy(asc(busEvents.seq));
	return rows.map((row) => ({
		id: row.id,
		time: row.timeText,
		from: row.fromAgent,
		to: row.toAgent,
		kind: asKind(row.kind),
		skill: row.skill,
		text: row.body,
		payload: row.payload,
		writes: row.writes,
		trace: row.trace,
	}));
}

async function readStore(db: AppDatabase, scope: AccountScope): Promise<Readonly<Record<string, unknown>>> {
	const checked = requireScope(scope);
	const rows =
		checked.mode === "platform"
			? await db.select().from(stateEntries).orderBy(asc(stateEntries.sortOrder))
			: await db
					.select()
					.from(stateEntries)
					.where(eq(stateEntries.accountId, checked.accountId))
					.orderBy(asc(stateEntries.sortOrder));
	const store: Record<string, unknown> = {};
	for (const row of rows) {
		store[row.key] = JSON.parse(row.value) as unknown;
	}
	return store;
}

async function listRules(db: AppDatabase, scope: AccountScope): Promise<readonly Rule[]> {
	const checked = requireScope(scope);
	const rows =
		checked.mode === "platform"
			? await db.select().from(rules).orderBy(asc(rules.sortOrder))
			: await db.select().from(rules).where(eq(rules.accountId, checked.accountId)).orderBy(asc(rules.sortOrder));
	return rows.map((row) => ({
		id: row.id,
		when: row.ruleWhen,
		agent: row.agent,
		action: row.action,
		approval: row.approval,
		on: row.isOn,
	}));
}

async function listApprovals(db: AppDatabase, scope: AccountScope): Promise<readonly Approval[]> {
	const checked = requireScope(scope);
	const rows =
		checked.mode === "platform"
			? await db.select().from(approvals).orderBy(asc(approvals.sortOrder))
			: await db
					.select()
					.from(approvals)
					.where(eq(approvals.accountId, checked.accountId))
					.orderBy(asc(approvals.sortOrder));
	return rows.map((row) => ({
		id: row.id,
		agent: row.agent,
		title: row.title,
		detail: row.detail,
		amount: row.amount,
		status: asApprovalStatus(row.status),
	}));
}

async function listProposals(db: AppDatabase, scope: AccountScope): Promise<readonly MissionProposal[]> {
	const checked = requireScope(scope);
	const rows =
		checked.mode === "platform"
			? await db.select().from(missionProposals).orderBy(asc(missionProposals.sortOrder))
			: await db
					.select()
					.from(missionProposals)
					.where(eq(missionProposals.accountId, checked.accountId))
					.orderBy(asc(missionProposals.sortOrder));
	return rows.map((row) => ({
		id: row.id,
		agent: row.agent,
		mission: row.mission,
		targets: row.targets,
		status: asProposalStatus(row.status),
	}));
}

async function readInbox(db: AppDatabase, scope: AccountScope): Promise<Inbox> {
	const storedApprovals = await listApprovals(db, scope);
	const storedProposals = await listProposals(db, scope);
	const empty = inboxIsEmpty(storedApprovals, storedProposals);
	return {
		approvals: storedApprovals.filter((item) => item.status === "Pending"),
		proposals: storedProposals.filter((item) => item.status !== "Approved"),
		count: inboxCount(storedApprovals, storedProposals),
		empty,
		emptyText: empty ? EMPTY_INBOX : "",
	};
}

async function listImages(db: AppDatabase, scope: AccountScope): Promise<readonly AgentImage[]> {
	requireScope(scope);
	const imageRows = await db.select().from(agentImages).orderBy(asc(agentImages.sortOrder));
	const bugRows = await db.select().from(bugs).orderBy(asc(bugs.sortOrder));
	const featureRows = await db.select().from(featureRequests).orderBy(asc(featureRequests.sortOrder));
	return imageRows.map((row) => ({
		id: row.id,
		name: row.name,
		role: row.role,
		tint: row.tint,
		tag: row.tag,
		version: row.version,
		nextVersion: row.nextVersion,
		updated: row.updated,
		updatedFull: row.updatedFull,
		deployed: row.deployed,
		onLatest: row.onLatest,
		status: asImageStatus(row.status),
		bugs: bugRows.filter((bug) => bug.imageId === row.id).map(toBug),
		features: featureRows.filter((feature) => feature.imageId === row.id).map(toFeature),
	}));
}

async function catalogCounts(db: AppDatabase, scope: AccountScope): Promise<CatalogCounts> {
	const images = await listImages(db, scope);
	return {
		images: images.length,
		openBugs: images.reduce((sum, image) => sum + image.bugs.length, 0),
		featuresRequested: images.reduce((sum, image) => sum + image.features.length, 0),
	};
}

async function readThread(db: AppDatabase, scope: AccountScope): Promise<Thread | null> {
	const checked = requireScope(scope);
	if (checked.mode !== "account") {
		return null;
	}
	const threadRows = await db
		.select()
		.from(threads)
		.where(eq(threads.accountId, checked.accountId))
		.orderBy(asc(threads.sortOrder));
	const thread = threadRows[0];
	if (!thread) {
		return null;
	}
	const messageRows = await db
		.select()
		.from(messages)
		.where(eq(messages.accountId, checked.accountId))
		.orderBy(asc(messages.sortOrder));
	const items: Message[] = messageRows.map((row) => ({
		id: row.id,
		from: asFrom(row.fromRole),
		...(row.agent ? { agent: row.agent } : {}),
		text: row.body,
	}));
	return { id: thread.id, messages: items };
}

function toBug(row: { id: string; sev: string; title: string; age: string; reports: number }): Bug {
	return { id: row.id, sev: asSeverity(row.sev), title: row.title, age: row.age, reports: row.reports };
}

function toFeature(row: { id: string; title: string; votes: number; stage: string }): FeatureRequest {
	return { id: row.id, title: row.title, votes: row.votes, stage: asStage(row.stage) };
}

function oneOf<T extends string>(value: string, allowed: readonly T[], label: string): T {
	const found = allowed.find((item) => item === value);
	if (!found) {
		throw new Error(`Unknown ${label}.`);
	}
	return found;
}

function asPlan(value: string): PlanName {
	return oneOf(value, ["Starter", "Growth", "Scale"], "plan");
}

function asStatus(value: string): AccountStatus {
	return oneOf(value, ["Active", "Trial", "Paused"], "status");
}

function asAutonomy(value: string): Autonomy {
	return oneOf(value, ["Ask first", "Auto under limit", "Full auto"], "autonomy");
}

function asGate(value: string): SkillGate {
	return oneOf(value, ["Auto", "Ask first", "Under limit"], "gate");
}

function asKind(value: string): BusKind {
	return oneOf(value, ["Task", "Result", "Request", "Relay", "Escalation", "Approval", "Declined"], "kind");
}

function asApprovalStatus(value: string): ApprovalStatus {
	return oneOf(value, ["Pending", "Approved", "Declined"], "approval status");
}

function asProposalStatus(value: string): MissionProposalStatus {
	return oneOf(value, ["Proposed", "Revising", "Approved"], "proposal status");
}

function asImageStatus(value: string): ImageStatus {
	return oneOf(value, ["Stable", "Needs attention", "Beta", "Draft"], "image status");
}

function asSeverity(value: string): Severity {
	return oneOf(value, ["High", "Medium", "Low"], "severity");
}

function asStage(value: string): FeatureStage {
	return oneOf(value, ["Backlog", "Planned", "In review", "In progress"], "stage");
}

function asFrom(value: string): MessageFrom {
	return oneOf(value, ["user", "master", "agent"], "message from");
}
