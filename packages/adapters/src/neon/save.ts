import type { AppDatabase } from "./db.ts";
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
import { type AccountSnapshot, squadId, type WorkspaceSnapshot } from "./snapshot.ts";

export async function saveWorkspace(db: AppDatabase, snapshot: WorkspaceSnapshot): Promise<void> {
	await db.delete(messages);
	await db.delete(threads);
	await db.delete(skills);
	await db.delete(machines);
	await db.delete(agents);
	await db.delete(squads);
	await db.delete(masters);
	await db.delete(rules);
	await db.delete(approvals);
	await db.delete(missionProposals);
	await db.delete(busEvents);
	await db.delete(stateEntries);
	await db.delete(dailyRevenue);
	await db.delete(overviewTiles);
	await db.delete(subscriptions);
	await db.delete(accounts);
	await db.delete(bugs);
	await db.delete(featureRequests);
	await db.delete(agentImages);
	await db.delete(plans);

	if (snapshot.plans.length > 0) {
		await db.insert(plans).values(
			snapshot.plans.map((plan) => ({
				id: plan.id,
				name: plan.name,
				monthly: plan.monthly,
			})),
		);
	}

	for (const image of snapshot.images) {
		await db.insert(agentImages).values({
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
		});
		if (image.bugs.length > 0) {
			await db.insert(bugs).values(
				image.bugs.map((bug) => ({
					id: bug.id,
					imageId: image.id,
					sev: bug.sev,
					title: bug.title,
					age: bug.age,
					reports: bug.reports,
				})),
			);
		}
		if (image.features.length > 0) {
			await db.insert(featureRequests).values(
				image.features.map((feature) => ({
					id: feature.id,
					imageId: image.id,
					title: feature.title,
					votes: feature.votes,
					stage: feature.stage,
				})),
			);
		}
	}

	for (const entry of snapshot.accounts) {
		await insertAccount(db, entry);
	}
}

async function insertAccount(db: AppDatabase, entry: AccountSnapshot): Promise<void> {
	const account = entry.account;
	await db.insert(accounts).values({
		id: account.id,
		accountId: account.id,
		name: account.name,
		owner: account.owner,
		email: account.email,
		tint: account.tint,
		agents: account.agents,
		online: account.online,
		tasks: account.tasks,
		lastActive: account.lastActive,
		createdWeek: account.createdWeek,
		mission: account.mission,
	});
	await db.insert(subscriptions).values({
		accountId: account.id,
		plan: account.plan,
		status: account.status,
		mrr: account.mrr,
		ltv: account.ltv,
		started: account.started,
	});
	if (account.squads.length > 0) {
		await db.insert(squads).values(
			account.squads.map((name) => ({
				accountId: account.id,
				id: squadId(name),
				name,
			})),
		);
	}
	await db.insert(masters).values({ accountId: account.id, name: entry.masterName });

	for (const agent of entry.agents) {
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
		});
		if (agent.skills.length > 0) {
			await db.insert(skills).values(
				agent.skills.map((skill) => ({
					accountId: account.id,
					agentId: agent.id,
					id: skill.id,
					description: skill.desc,
					gate: skill.gate,
					runs: skill.runs,
					isOn: skill.on,
				})),
			);
		}
	}

	if (entry.events.length > 0) {
		await db.insert(busEvents).values(
			entry.events.map((event) => ({
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
			})),
		);
	}

	const storeKeys = Object.keys(entry.store);
	if (storeKeys.length > 0) {
		await db.insert(stateEntries).values(
			storeKeys.map((key) => ({
				accountId: account.id,
				key,
				value: entry.store[key],
			})),
		);
	}

	if (entry.rules.length > 0) {
		await db.insert(rules).values(
			entry.rules.map((rule) => ({
				accountId: account.id,
				id: rule.id,
				ruleWhen: rule.when,
				agent: rule.agent,
				action: rule.action,
				approval: rule.approval,
				isOn: rule.on,
			})),
		);
	}

	if (entry.approvals.length > 0) {
		await db.insert(approvals).values(
			entry.approvals.map((approval) => ({
				accountId: account.id,
				id: approval.id,
				agent: approval.agent,
				title: approval.title,
				detail: approval.detail,
				amount: approval.amount,
				status: approval.status,
			})),
		);
	}

	if (entry.proposals.length > 0) {
		await db.insert(missionProposals).values(
			entry.proposals.map((proposal) => ({
				accountId: account.id,
				id: proposal.id,
				agent: proposal.agent,
				mission: proposal.mission,
				targets: proposal.targets,
				status: proposal.status,
			})),
		);
	}

	if (entry.revenue.length > 0) {
		await db.insert(dailyRevenue).values(
			entry.revenue.map((day) => ({
				accountId: account.id,
				day: day.day,
				amount: day.amount,
			})),
		);
	}

	if (entry.tiles && entry.tiles.length > 0) {
		await db.insert(overviewTiles).values({
			accountId: account.id,
			tiles: entry.tiles,
		});
	}

	if (entry.messages.length > 0) {
		await db.insert(threads).values({ accountId: account.id, id: "dock" });
		await db.insert(messages).values(
			entry.messages.map((message) => ({
				accountId: account.id,
				threadId: "dock",
				id: message.id,
				fromRole: message.from,
				agent: message.agent ?? null,
				body: message.text,
			})),
		);
	}
}
