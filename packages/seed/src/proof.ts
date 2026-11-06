import type { WorkspaceSnapshot } from "@tensquads/adapters";
import type { Agent, AgentImage, Plan, PlanName, Skill, SkillGate } from "@tensquads/domain";
import { PROOF_PREVIEW_URL, proofStory } from "@tensquads/domain/master";

import { emptyAgent, emptyOverviewTiles } from "./blank-agent.ts";
import { design } from "./design-file.ts";

// This snapshot stays out of workspaceFromDesign. Adding it there changes the nine done numbers.

function skill(id: string, desc: string, gate: SkillGate, runs: number): Skill {
	return { id, desc, gate, runs, on: true };
}

function image(id: string, name: string, tint: string, tag: string): AgentImage {
	return {
		id,
		name,
		role: name,
		tint,
		tag,
		version: "0.1.0",
		nextVersion: "0.1.0",
		updated: "5 Nov",
		updatedFull: "5 November 2026",
		deployed: 0,
		onLatest: 0,
		status: "Beta",
		bugs: [],
		features: [],
	};
}

function agent(input: {
	readonly id: string;
	readonly role: string;
	readonly tint: string;
	readonly mission: string;
	readonly host: string;
	readonly last: string;
	readonly skills: readonly Skill[];
	readonly target: readonly [string, string, string];
}): Agent {
	return emptyAgent({
		...input,
		region: "Frankfurt",
		size: "2 vCPU · 4 GB",
		cpu: "0%",
		uptime: "Just started",
	});
}

export async function proofOfConceptWorkspace(): Promise<WorkspaceSnapshot> {
	const story = await proofStory();
	const prices = design.planPrice;
	const plans: Plan[] = (["Starter", "Growth", "Scale"] as const).map((name) => ({
		id: name,
		name,
		monthly: prices[name] ?? 0,
	}));
	const market = agent({
		id: "market",
		role: "Market researcher",
		tint: "#fde2f3",
		mission: "Find the competitors and name the gap.",
		host: "proof-market",
		last: "12:06",
		target: ["Competitors", "3", "3"],
		skills: [
			skill("web.search", "Search the web for competitors.", "Auto", 1),
			skill("maps.competitors", "List competitors from map results.", "Auto", 1),
			skill("scrapling.read_page", "Read a competitor page.", "Auto", 1),
			skill("market.analyse", "Name the offer, the price, and the gap.", "Auto", 1),
			skill("report.write", "Write the report with the citation.", "Auto", 1),
			skill("competition.watch", "Watch one competitor page.", "Ask first", 0),
		],
	});
	const website = agent({
		id: "website",
		role: "Website builder",
		tint: "#e5e9f0",
		mission: "Build one page from the brief.",
		host: "proof-website",
		last: "12:13",
		target: ["Pages", "1", "1"],
		skills: [
			skill("site.build", "Build the page from the brief.", "Auto", 1),
			skill("site.critique", "Check the page before preview.", "Auto", 1),
			skill("site.preview", "Publish the preview URL.", "Auto", 1),
			skill("site.publish", "Publish the page after a yes.", "Ask first", 1),
		],
	});
	return {
		plans,
		images: [
			image("market", "Market researcher", "#fde2f3", "registry.agents.co/market:0.1.0"),
			image("website", "Website builder", "#e5e9f0", "registry.agents.co/website:0.1.0"),
		],
		accounts: [
			{
				account: {
					id: "proof",
					name: "Proof Kitchen",
					owner: "Proof Owner",
					email: "proof@example.com",
					plan: "Starter" as PlanName,
					tint: "#fde2f3",
					squads: ["Market researcher", "Website builder"],
					agents: 2,
					online: 2,
					tasks: 0,
					lastActive: "12:13",
					status: "Active",
					createdWeek: 1,
					started: "2026-11-05",
					mrr: 0,
					ltv: 0,
					mission: "Prove one restaurant loop.",
				},
				agents: [market, website],
				events: story.events,
				store: {},
				rules: [],
				approvals: [],
				proposals: [],
				revenue: [],
				tiles: emptyOverviewTiles(),
				messages: [
					{
						id: "poc-chat-1",
						from: "master",
						text: `The site preview is ${PROOF_PREVIEW_URL}`,
					},
				],
				masterName: "Master",
			},
		],
	};
}
