import { characterName, type SquadmateDrawState } from "@tensquads/squadmates";

export type BusinessKind = "new" | "existing";

export const homeAgents = [
	{
		id: "orders",
		draw: "checking",
		name: "Orders",
		role: "Fulfilment and tracking",
		tint: "#e7efff",
		dot: "#00a240",
		last: "Added tracking to #A-1007",
		pitch: "Marks items shipped, syncs tracking from your maker and tells the customer, without you opening a tab.",
		tools: ["shopify", "printify"],
	},
	{
		id: "support",
		draw: "done",
		name: "Support",
		role: "Customer inbox and refunds",
		tint: "#def5ee",
		dot: "#00a240",
		last: "Replied to T-2291 in 4 min",
		pitch: "Answers in your voice, looks up the order itself and refunds under the limit you set.",
		tools: ["gmail", "shopify"],
	},
	{
		id: "marketing",
		draw: "escalated",
		name: "Marketing",
		role: "Ads, social and email",
		tint: "#ece3ff",
		dot: "#00a240",
		last: "Asked to raise the prints ad set",
		pitch: "Reports spend and return every morning, drafts posts and campaigns, asks before spending more.",
		tools: ["meta ads", "klaviyo", "canva"],
	},
	{
		id: "finance",
		draw: "done",
		name: "Finance",
		role: "Payouts, costs and profit",
		tint: "#ffefa4",
		dot: "#00a240",
		last: "Sent the weekly profit summary",
		pitch: "Matches bills to orders, tracks fees and payouts, and sends a profit summary you can read in a minute.",
		tools: ["stripe", "quickbooks"],
	},
	{
		id: "inventory",
		draw: "blocked",
		name: "Inventory",
		role: "Stock and suppliers",
		tint: "#fee7c2",
		dot: "#cdcdcd",
		last: "Drafted a reorder of 50 hoodies",
		pitch: "Watches stock across products, flags what is running low and drafts the reorder for your approval.",
		tools: ["shopify", "printify"],
	},
	{
		id: "market",
		draw: "running",
		name: "Market researcher",
		role: "Competitors and positioning",
		tint: "#fde2f3",
		dot: "#00a240",
		last: "Found 4 competitors for [BUSINESS]",
		pitch: "Finds who you compete with, reads their sites and prices, and tells the master how they are doing.",
		tools: ["web search", "scrapling"],
	},
	{
		id: "website",
		draw: "done",
		name: "Website builder",
		role: "Landing pages and site updates",
		tint: "#e5e9f0",
		dot: "#00a240",
		last: "Preview ready",
		pitch: "Builds a landing page from the market report and the master's brief, and publishes only when you say so.",
		tools: ["cloudflare pages"],
	},
] as const satisfies readonly {
	readonly id: string;
	readonly draw: SquadmateDrawState;
	readonly name: string;
	readonly role: string;
	readonly tint: string;
	readonly dot: string;
	readonly last: string;
	readonly pitch: string;
	readonly tools: readonly string[];
}[];

for (const agent of homeAgents) {
	if (characterName(agent.id) === null) {
		throw new Error(`Missing homepage character name: ${agent.id}`);
	}
}

export const castMates = [
	"master",
	"orders",
	"support",
	"marketing",
	"finance",
	"inventory",
	"market",
	"website",
	"analytics",
] as const;

export const logos = [
	"Leen Dates",
	"Northwind Apparel",
	"Atlas Outdoor",
	"Bloom Skincare",
	"Harbor Coffee",
	"Sunbeam Toys",
];

export const previewKpis = [
	{ label: "Revenue", value: "$8,420", delta: "+12% vs last week" },
	{ label: "Orders", value: "186", delta: "+8%" },
	{ label: "Tasks done by agents", value: "331", delta: "This week" },
	{ label: "Hours saved", value: "34h", delta: "This week" },
];

export const steps = [
	{
		n: "1",
		title: "Tell us about the business",
		body: "New or existing, what you sell, where you sell it. A couple of sentences is enough to brief the squad.",
	},
	{
		n: "2",
		title: "Pick your agents and connect",
		body: "Choose the agents you want and connect your store, inbox and ads. Each agent gets its own isolated machine and only the keys it needs.",
	},
	{
		n: "3",
		title: "Set the limits, then let go",
		body: "Decide what agents can do alone and what needs a yes from you. Loosen the limits as you build trust.",
	},
];

export const controls = [
	{
		title: "Spend and refund caps.",
		body: "Per agent, per day. Anything over the cap lands in your approval inbox with the reasoning.",
	},
	{
		title: "Every action is logged.",
		body: "See who asked what, which skill ran and what changed, message by message.",
	},
	{
		title: "Isolated by default.",
		body: "Each agent runs on its own machine with its own secrets and an allowlist of sites it may reach.",
	},
	{
		title: "Pause anything, any time.",
		body: "One switch per agent, one per skill. Paused agents keep their memory and pick up where they left off.",
	},
];

export const plans = [
	{
		name: "Starter",
		price: "$49",
		who: "One shop, a couple of agents, you still do most of the work.",
		features: ["Up to 3 agents", "1 squad", "Ask-first mode on every action", "Email support"],
		cta: "Start free",
		dark: false,
		popular: false,
	},
	{
		name: "Growth",
		price: "$149",
		who: "A running store that wants the daily work off its plate.",
		features: [
			"Up to 10 agents",
			"3 squads",
			"Spend and refund limits",
			"Agent traffic and audit log",
			"Priority support",
		],
		cta: "Start free",
		dark: true,
		popular: true,
	},
	{
		name: "Scale",
		price: "$399",
		who: "Several stores or regions, each with its own squad.",
		features: [
			"Up to 25 agents",
			"Unlimited squads",
			"Custom rules and triggers",
			"Dedicated region and SSO",
			"Onboarding with a human",
		],
		cta: "Talk to us",
		dark: false,
		popular: false,
	},
] as const;

export function placeholderFor(kind: BusinessKind): string {
	return kind === "new"
		? "Describe what you want to sell and to whom…"
		: "Paste your store URL or describe what you sell…";
}

export function examplesFor(kind: BusinessKind): readonly string[] {
	return kind === "new"
		? ["Date-seed coffee, caffeine-free", "Handmade ceramics on Etsy", "A print-on-demand streetwear brand"]
		: [
				"A Shopify store doing 300 orders a month",
				"A cafe with a wholesale side",
				"Two Amazon listings and a website",
			];
}
