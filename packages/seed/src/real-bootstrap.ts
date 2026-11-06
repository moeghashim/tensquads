import { type AccountSnapshot, type AppDatabase, createAccount, schema } from "@tensquads/adapters";
import type { PlanName, Skill } from "@tensquads/domain";

import { emptyAgent, emptyOverviewTiles } from "./blank-agent.ts";
import { design } from "./design-file.ts";

// Same key the real Worker reads in account-request.ts. This file does not import that module.
export const REAL_BUSINESS_KEY = "state:business";

export interface RealAccountInput {
	readonly accountId: string;
	readonly businessName: string;
	readonly businessType: "restaurant" | "grocer";
	readonly ownerEmail: string;
	readonly ownerClerkUserId: string;
	readonly now: Date;
}

const clerkUserIdPattern = /^user_[A-Za-z0-9]+$/;

const accountTint = "#e7efff";

function skill(id: string, desc: string, gate: Skill["gate"]): Skill {
	return { id, desc, gate, runs: 0, on: true };
}

function monthly(name: PlanName): number {
	const price = design.planPrice[name];
	if (price === undefined) throw new Error("The plan price is missing.");
	return price;
}

function startedOn(date: Date): string {
	const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	const month = months[date.getUTCMonth()];
	if (!month) throw new Error("The start date is not valid.");
	return `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`;
}

function masterSkills(): readonly Skill[] {
	return [
		skill("brief.write", "Write the brief.", "Auto"),
		skill("task.route", "Send the task to the squad.", "Auto"),
		skill("approval.ask", "Ask before the next step.", "Auto"),
		skill("check.run", "Run the check.", "Auto"),
	];
}

function marketSkills(): readonly Skill[] {
	return [
		skill("web.search", "Search the web for competitors.", "Auto"),
		skill("maps.competitors", "List competitors from map results.", "Auto"),
		skill("scrapling.read_page", "Read a competitor page.", "Auto"),
		skill("market.analyse", "Name the offer, the price, and the gap.", "Auto"),
		skill("report.write", "Write the report with the citation.", "Auto"),
		skill("competition.watch", "Watch one competitor page.", "Ask first"),
	];
}

function websiteSkills(): readonly Skill[] {
	return [
		skill("site.build", "Build the page from the brief.", "Auto"),
		skill("site.critique", "Check the page before preview.", "Auto"),
		skill("site.preview", "Publish the preview URL.", "Auto"),
		skill("site.publish", "Publish the page after a yes.", "Ask first"),
	];
}

function realSnapshot(input: RealAccountInput): AccountSnapshot {
	return {
		clerkUserId: input.ownerClerkUserId,
		account: {
			id: input.accountId,
			name: input.businessName,
			owner: input.ownerEmail,
			email: input.ownerEmail,
			plan: "Starter",
			tint: accountTint,
			squads: ["Master", "Market researcher", "Website builder"],
			agents: 3,
			online: 0,
			tasks: 0,
			lastActive: "",
			status: "Trial",
			createdWeek: 0,
			started: startedOn(input.now),
			mrr: 0,
			ltv: 0,
			mission: `Run one ${input.businessType} loop.`,
		},
		agents: [
			emptyAgent({
				id: "master",
				role: "Master",
				tint: "#e8e8e8",
				mission: "Coordinate the squad.",
				target: ["Checks", "0", "1"],
				skills: masterSkills(),
			}),
			emptyAgent({
				id: "market",
				role: "Market researcher",
				tint: "#fde2f3",
				mission: "Find the competitors and name the gap.",
				target: ["Competitors", "0", "3"],
				skills: marketSkills(),
			}),
			emptyAgent({
				id: "website",
				role: "Website builder",
				tint: "#e5e9f0",
				mission: "Build one page from the brief.",
				target: ["Pages", "0", "1"],
				skills: websiteSkills(),
			}),
		],
		events: [],
		store: {
			[REAL_BUSINESS_KEY]: {
				businessName: input.businessName,
				businessType: input.businessType,
				items: [],
			},
		},
		rules: [],
		approvals: [],
		proposals: [],
		revenue: [],
		tiles: emptyOverviewTiles(),
		messages: [],
		masterName: "Master",
	};
}

async function ensureCatalog(db: AppDatabase): Promise<void> {
	const names = ["Starter", "Growth", "Scale"] as const;
	await db
		.insert(schema.plans)
		.values(names.map((name, index) => ({ id: name, name, monthly: monthly(name), sortOrder: index })))
		.onConflictDoNothing();
	await db
		.insert(schema.agentImages)
		.values([
			{
				id: "market",
				name: "Market researcher",
				role: "Market researcher",
				tint: "#fde2f3",
				tag: "registry.agents.co/market:0.1.0",
				version: "0.1.0",
				nextVersion: "0.1.0",
				updated: "",
				updatedFull: "",
				deployed: 0,
				onLatest: 0,
				status: "Beta",
				sortOrder: 0,
			},
			{
				id: "website",
				name: "Website builder",
				role: "Website builder",
				tint: "#e5e9f0",
				tag: "registry.agents.co/website:0.1.0",
				version: "0.1.0",
				nextVersion: "0.1.0",
				updated: "",
				updatedFull: "",
				deployed: 0,
				onLatest: 0,
				status: "Beta",
				sortOrder: 1,
			},
		])
		.onConflictDoNothing();
}

function assertRealAccount(input: RealAccountInput): void {
	if (input.accountId.trim().length === 0) throw new Error("The account id is missing.");
	if (input.businessName.trim().length === 0) throw new Error("The business name is missing.");
	if (input.businessType !== "restaurant" && input.businessType !== "grocer") {
		throw new Error("The business type must be restaurant or grocer.");
	}
	if (!input.ownerEmail.includes("@")) throw new Error("The owner email is missing.");
	if (!clerkUserIdPattern.test(input.ownerClerkUserId)) throw new Error("The owner Clerk user id is not valid.");
}

export async function bootstrapRealAccount(db: AppDatabase, input: RealAccountInput): Promise<void> {
	assertRealAccount(input);
	await ensureCatalog(db);
	await createAccount(db, realSnapshot(input));
}
