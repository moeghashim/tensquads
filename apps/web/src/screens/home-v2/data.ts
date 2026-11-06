import { characterName, type SquadmateDrawState } from "@tensquads/squadmates";

export {
	type BusinessKind,
	controls,
	examplesFor,
	logos,
	placeholderFor,
	plans,
} from "../home/data.ts";

export function nameOf(id: string): string {
	const name = characterName(id);
	if (name === null) {
		throw new Error(`Missing squadmate character name: ${id}`);
	}
	return name;
}

export const heroCards = [
	{
		id: "orders",
		tag: "Orders",
		amt: "$18",
		title: "Ship order A-1031 by express",
		body: "The customer needs it by Friday. Express is $18. Your shipping limit is $12.",
		check: "Address and stock checked",
	},
	{
		id: "support",
		tag: "Support",
		amt: "$64",
		title: "Refund Amira and send a new print",
		body: "Her print arrived torn. The refund is $64. Your refund limit is $50.",
		check: "Photo of the damage on file",
	},
	{
		id: "website",
		tag: "Website",
		amt: "Preview",
		title: "Put the autumn sale banner on your homepage",
		body: "The draft is ready. Changes to your site always wait for your yes.",
		check: "Checked on phone and desktop",
	},
	{
		id: "marketing",
		tag: "Marketing",
		amt: "$60 / day",
		title: "Raise the prints ad set from $40 to $60 a day",
		body: "Return has been above 3× for 7 days. Your daily cap is $50.",
		check: "Spend and return verified",
	},
] as const;

export const squadAgents = [
	{
		id: "orders",
		draw: "idle",
		tag: "Orders",
		role: "Fulfilment and tracking",
		dot: "#00a240",
		last: "Added tracking to #A-1007",
		pitch: "Marks items shipped, syncs tracking from your maker and tells the customer, without you opening a tab.",
		tools: ["shopify", "printify"],
	},
	{
		id: "support",
		draw: "idle",
		tag: "Support",
		role: "Customer inbox and refunds",
		dot: "#00a240",
		last: "Replied to T-2291 in 4 min",
		pitch: "Answers in your voice, looks up the order itself and refunds under the limit you set.",
		tools: ["gmail", "shopify"],
	},
	{
		id: "marketing",
		draw: "idle",
		tag: "Marketing",
		role: "Ads, social and email",
		dot: "#00a240",
		last: "Asked to raise the prints ad set",
		pitch: "Reports spend and return every morning, drafts posts and campaigns, asks before spending more.",
		tools: ["meta ads", "klaviyo", "canva"],
	},
	{
		id: "finance",
		draw: "idle",
		tag: "Finance",
		role: "Payouts, costs and profit",
		dot: "#00a240",
		last: "Sent the weekly profit summary",
		pitch: "Matches bills to orders, tracks fees and payouts, and sends a profit summary you can read in a minute.",
		tools: ["stripe", "quickbooks"],
	},
	{
		id: "inventory",
		draw: "waiting",
		tag: "Inventory",
		role: "Stock and suppliers",
		dot: "#cdcdcd",
		last: "Drafted a reorder of 50 hoodies",
		pitch: "Watches stock across products, flags what is running low and drafts the reorder for your approval.",
		tools: ["shopify", "printify"],
	},
	{
		id: "market",
		draw: "idle",
		tag: "Market researcher",
		role: "Competitors and positioning",
		dot: "#00a240",
		last: "Found 4 competitors for [BUSINESS]",
		pitch: `Finds who you compete with, reads their sites and prices, and tells ${nameOf("master")} how they are doing.`,
		tools: ["web search", "scrapling"],
	},
	{
		id: "website",
		draw: "idle",
		tag: "Website builder",
		role: "Landing pages and site updates",
		dot: "#00a240",
		last: "Preview ready",
		pitch: `Builds a landing page from the market report and ${nameOf("master")}'s brief, and publishes only when you say so.`,
		tools: ["cloudflare pages"],
	},
] as const satisfies readonly {
	readonly id: string;
	readonly draw: SquadmateDrawState;
	readonly tag: string;
	readonly role: string;
	readonly dot: string;
	readonly last: string;
	readonly pitch: string;
	readonly tools: readonly string[];
}[];

for (const card of heroCards) {
	nameOf(card.id);
}
for (const agent of squadAgents) {
	nameOf(agent.id);
}

export const steps = [
	{
		n: "1",
		who: "master",
		title: "Tell us about the business",
		body: "New or existing, what you sell, where you sell it. A couple of sentences is enough to brief the squad.",
	},
	{
		n: "2",
		who: "orders",
		title: "Pick your agents and connect",
		body: "Choose the agents you want and connect your store, inbox and ads. Each agent gets its own isolated machine and only the keys it needs.",
	},
	{
		n: "3",
		who: "finance",
		title: "Set the limits, then let go",
		body: "Decide what agents can do alone and what needs a yes from you. Loosen the limits as you build trust.",
	},
] as const;

export const limits = [
	{ label: "Refund without asking, up to", amount: "$50", width: "50%" },
	{ label: "Ad spend per day", amount: "$50", width: "38%" },
	{ label: "Reorder without asking, up to", amount: "$500", width: "62%" },
] as const;

export const finalLineup = [
	{ id: "orders", state: "idle", size: 60 },
	{ id: "support", state: "idle", size: 60 },
	{ id: "marketing", state: "idle", size: 60 },
	{ id: "master", state: "running", size: 84 },
	{ id: "finance", state: "idle", size: 60 },
	{ id: "inventory", state: "idle", size: 60 },
	{ id: "website", state: "idle", size: 60 },
] as const satisfies readonly {
	readonly id: string;
	readonly state: SquadmateDrawState;
	readonly size: number;
}[];
