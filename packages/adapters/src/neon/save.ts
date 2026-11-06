import { eq } from "drizzle-orm";

import {
	deleteAccountBusEvents,
	deleteAccountStateEntries,
	deleteAllBusEvents,
	deleteAllStateEntries,
	insertBusEvents,
	insertStateRows,
} from "../cloudflare-bus/neon-write.ts";
import { workspaceTransaction } from "./lock.ts";
import type { AppDatabase } from "./postgres.ts";
import {
	accounts,
	agentImages,
	agents,
	approvals,
	bugs,
	busCursors,
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
	subscriptions,
	threads,
} from "./schema.ts";
import { type AccountSnapshot, squadId, type WorkspaceSnapshot } from "./snapshot.ts";

const RANK = 10_000;

function rank(group: number, index: number): number {
	return group * RANK + index;
}

/**
 * Replace all tenant and catalog rows with this snapshot in one transaction.
 * This is a full database seed, not an account-scoped update. A failure preserves existing rows.
 * Apply the schema migration before calling this function.
 */
export async function saveWorkspace(db: AppDatabase, snapshot: WorkspaceSnapshot): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.delete(messages);
		await tx.delete(threads);
		await tx.delete(skills);
		await tx.delete(machines);
		await tx.delete(agents);
		await tx.delete(squads);
		await tx.delete(masters);
		await tx.delete(rules);
		await tx.delete(missionProposals);
		await deleteAllBusEvents(tx);
		await deleteAllStateEntries(tx);
		await tx.delete(dailyRevenue);
		await tx.delete(overviewTiles);
		await tx.delete(subscriptions);
		await tx.delete(busCursors);
		await tx.delete(accounts);
		await tx.delete(bugs);
		await tx.delete(featureRequests);
		await tx.delete(agentImages);
		await tx.delete(plans);

		if (snapshot.plans.length > 0) {
			await tx.insert(plans).values(
				snapshot.plans.map((plan, index) => ({
					id: plan.id,
					name: plan.name,
					monthly: plan.monthly,
					sortOrder: index,
				})),
			);
		}

		for (const [imageIndex, image] of snapshot.images.entries()) {
			await tx.insert(agentImages).values({
				id: image.id,
				name: image.name,
				role: image.role,
				tint: image.tint,
				tag: image.tag,
				version: image.version,
				nextVersion: image.nextVersion,
				updated: image.updated,
				updatedFull: image.updatedFull,
				deployed: image.deployed,
				onLatest: image.onLatest,
				status: image.status,
				sortOrder: imageIndex,
			});
			if (image.bugs.length > 0) {
				await tx.insert(bugs).values(
					image.bugs.map((bug, index) => ({
						id: bug.id,
						imageId: image.id,
						sev: bug.sev,
						title: bug.title,
						age: bug.age,
						reports: bug.reports,
						sortOrder: imageIndex * 1_000 + index,
					})),
				);
			}
			if (image.features.length > 0) {
				await tx.insert(featureRequests).values(
					image.features.map((feature, index) => ({
						id: feature.id,
						imageId: image.id,
						title: feature.title,
						votes: feature.votes,
						stage: feature.stage,
						sortOrder: imageIndex * 1_000 + index,
					})),
				);
			}
		}

		for (const [accountIndex, entry] of snapshot.accounts.entries()) {
			await insertAccount(tx, entry, accountIndex);
		}
	});
}

async function insertAccount(
	db: Pick<AppDatabase, "insert">,
	entry: AccountSnapshot,
	accountIndex: number,
): Promise<void> {
	const account = entry.account;
	await db.insert(accounts).values({
		id: account.id,
		accountId: account.id,
		name: account.name,
		owner: account.owner,
		email: account.email,
		clerkUserId: entry.clerkUserId ?? null,
		tint: account.tint,
		agents: account.agents,
		online: account.online,
		tasks: account.tasks,
		lastActive: account.lastActive,
		createdWeek: account.createdWeek,
		mission: account.mission,
		sortOrder: accountIndex,
	});
	await db.insert(subscriptions).values({
		accountId: account.id,
		plan: account.plan,
		status: account.status,
		mrr: account.mrr,
		ltv: account.ltv,
		started: account.started,
		sortOrder: accountIndex,
	});
	if (account.squads.length > 0) {
		await db.insert(squads).values(
			account.squads.map((name, index) => ({
				accountId: account.id,
				id: squadId(name),
				name,
				sortOrder: rank(accountIndex, index),
			})),
		);
	}
	await db.insert(masters).values({ accountId: account.id, name: entry.masterName, sortOrder: accountIndex });
	await db.insert(busCursors).values({
		accountId: account.id,
		seq: 100,
		clock: 11 * 60 + 2,
		scriptIndex: 0,
	});

	await insertAgents(db, entry, accountIndex);
	await insertActivity(db, entry, accountIndex);
	await insertPolicy(db, entry, accountIndex);
	await insertMetrics(db, entry, accountIndex);
	await insertMessages(db, entry, accountIndex);
}

async function insertAgents(
	db: Pick<AppDatabase, "insert">,
	entry: AccountSnapshot,
	accountIndex: number,
): Promise<void> {
	const account = entry.account;
	for (const [agentIndex, agent] of entry.agents.entries()) {
		const sortOrder = rank(accountIndex, agentIndex);
		await db.insert(agents).values({
			accountId: account.id,
			id: agent.id,
			name: agent.name,
			role: agent.role,
			tint: agent.tint,
			isOn: agent.on,
			autonomy: agent.autonomy,
			mission: agent.mission,
			contribution: agent.contribution,
			tasks: agent.tasks,
			success: agent.success,
			saved: agent.saved,
			lastText: agent.last,
			targets: agent.targets,
			kpis: agent.kpis,
			sortOrder,
		});
		await db.insert(machines).values({
			accountId: account.id,
			agentId: agent.id,
			host: agent.host,
			region: agent.region,
			size: agent.size,
			cpu: agent.cpu,
			uptime: agent.uptime,
			egress: agent.egress,
			secrets: agent.secrets,
			sortOrder,
		});
		if (agent.skills.length > 0) {
			await db.insert(skills).values(
				agent.skills.map((skill, skillIndex) => ({
					accountId: account.id,
					agentId: agent.id,
					id: skill.id,
					description: skill.desc,
					gate: skill.gate,
					runs: skill.runs,
					isOn: skill.on,
					sortOrder: sortOrder * 100 + skillIndex,
				})),
			);
		}
	}
}

async function insertActivity(
	db: Pick<AppDatabase, "insert">,
	entry: AccountSnapshot,
	accountIndex: number,
): Promise<void> {
	const account = entry.account;
	if (entry.events.length > 0) {
		await insertBusEvents(
			db,
			entry.events.map((event, index) => ({
				accountId: account.id,
				id: event.id,
				timeText: event.time,
				fromAgent: event.from,
				toAgent: event.to,
				kind: event.kind,
				skill: event.skill,
				body: event.text,
				payload: { ...event.payload },
				writes: event.writes,
				trace: event.trace,
				seq: rank(accountIndex, index),
			})),
		);
	}

	const storeKeys = Object.keys(entry.store);
	if (storeKeys.length > 0) {
		await insertStateRows(
			db,
			storeKeys.map((key, index) => ({
				accountId: account.id,
				key,
				value: JSON.stringify(entry.store[key]),
				sortOrder: rank(accountIndex, index),
			})),
		);
	}
}

async function insertPolicy(
	db: Pick<AppDatabase, "insert">,
	entry: AccountSnapshot,
	accountIndex: number,
): Promise<void> {
	const account = entry.account;
	if (entry.rules.length > 0) {
		await db.insert(rules).values(
			entry.rules.map((rule, index) => ({
				accountId: account.id,
				id: rule.id,
				ruleWhen: rule.when,
				agent: rule.agent,
				action: rule.action,
				approval: rule.approval,
				isOn: rule.on,
				sortOrder: rank(accountIndex, index),
			})),
		);
	}

	if (entry.approvals.length > 0) {
		await db.insert(approvals).values(
			entry.approvals.map((approval, index) => ({
				accountId: account.id,
				id: approval.id,
				agent: approval.agent,
				title: approval.title,
				detail: approval.detail,
				amount: approval.amount,
				status: approval.status,
				sortOrder: rank(accountIndex, index),
			})),
		);
	}

	if (entry.proposals.length > 0) {
		await db.insert(missionProposals).values(
			entry.proposals.map((proposal, index) => ({
				accountId: account.id,
				id: proposal.id,
				agent: proposal.agent,
				mission: proposal.mission,
				targets: proposal.targets,
				status: proposal.status,
				sortOrder: rank(accountIndex, index),
			})),
		);
	}
}

async function insertMetrics(
	db: Pick<AppDatabase, "insert">,
	entry: AccountSnapshot,
	accountIndex: number,
): Promise<void> {
	const account = entry.account;
	if (entry.revenue.length > 0) {
		await db.insert(dailyRevenue).values(
			entry.revenue.map((day, index) => ({
				accountId: account.id,
				day: day.day,
				amount: day.amount,
				sortOrder: rank(accountIndex, index),
			})),
		);
	}

	if (entry.tiles && entry.tiles.length > 0) {
		await db.insert(overviewTiles).values({
			accountId: account.id,
			tiles: entry.tiles,
		});
	}
}

type AccountWriter = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

function accountExists(accountId: string): Error & { readonly code: "account_exists" } {
	const error = new Error(`The account ${accountId} already exists.`) as Error & { code: "account_exists" };
	error.name = "AccountExistsError";
	error.code = "account_exists";
	return error;
}

export async function createAccount(db: AppDatabase, entry: AccountSnapshot): Promise<void> {
	const id = entry.account.id;
	await workspaceTransaction(db, (tx) => insertNewAccount(tx, entry), { accountId: id });
}

async function insertNewAccount(tx: AccountWriter, entry: AccountSnapshot): Promise<void> {
	const id = entry.account.id;
	const existing = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, id));
	if (existing[0]) throw accountExists(id);
	await insertAccount(tx, entry, 0);
}

export async function writeAccount(db: AppDatabase, entry: AccountSnapshot): Promise<void> {
	const id = entry.account.id;
	// A reset is one account's writer. The shared global key lets other accounts proceed.
	await workspaceTransaction(
		db,
		async (tx) => {
			await tx.delete(messages).where(eq(messages.accountId, id));
			await tx.delete(threads).where(eq(threads.accountId, id));
			await tx.delete(skills).where(eq(skills.accountId, id));
			await tx.delete(machines).where(eq(machines.accountId, id));
			await tx.delete(agents).where(eq(agents.accountId, id));
			await tx.delete(squads).where(eq(squads.accountId, id));
			await tx.delete(masters).where(eq(masters.accountId, id));
			await tx.delete(rules).where(eq(rules.accountId, id));
			await tx.delete(missionProposals).where(eq(missionProposals.accountId, id));
			await deleteAccountBusEvents(tx, id);
			await deleteAccountStateEntries(tx, id);
			await tx.delete(dailyRevenue).where(eq(dailyRevenue.accountId, id));
			await tx.delete(overviewTiles).where(eq(overviewTiles.accountId, id));
			await tx.delete(subscriptions).where(eq(subscriptions.accountId, id));
			await tx.delete(busCursors).where(eq(busCursors.accountId, id));
			await tx.delete(accounts).where(eq(accounts.id, id));
			await insertAccount(tx, entry, 0);
		},
		{ accountId: id },
	);
}

async function insertMessages(
	db: Pick<AppDatabase, "insert">,
	entry: AccountSnapshot,
	accountIndex: number,
): Promise<void> {
	const account = entry.account;
	if (entry.messages.length > 0) {
		await db.insert(threads).values({ accountId: account.id, id: "dock", sortOrder: accountIndex });
		await db.insert(messages).values(
			entry.messages.map((message, index) => ({
				accountId: account.id,
				threadId: "dock",
				id: message.id,
				fromRole: message.from,
				agent: message.agent ?? null,
				body: message.text,
				sortOrder: rank(accountIndex, index),
			})),
		);
	}
}
