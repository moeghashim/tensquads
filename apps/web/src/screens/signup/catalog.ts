export interface SquadChoice {
	readonly id: string;
	readonly name: string;
	readonly role: string;
	readonly tint: string;
	readonly whyNew: string;
	readonly whyExisting: string;
}

export const squadChoices: readonly SquadChoice[] = [
	{
		id: "orders",
		name: "Orders",
		role: "Fulfilment and tracking",
		tint: "#e7efff",
		whyNew: "Ready for your first order",
		whyExisting: "Syncs tracking and chases the maker",
	},
	{
		id: "support",
		name: "Support",
		role: "Customer inbox and refunds",
		tint: "#def5ee",
		whyNew: "Replies in your voice, refunds under a limit you set",
		whyExisting: "Replies in your voice, refunds under a limit you set",
	},
	{
		id: "marketing",
		name: "Marketing",
		role: "Ads, social and email",
		tint: "#ece3ff",
		whyNew: "Drafts your launch campaign and first posts",
		whyExisting: "Watches ad spend and return",
	},
	{
		id: "finance",
		name: "Finance",
		role: "Payouts, costs and profit",
		tint: "#ffefa4",
		whyNew: "Weekly profit summary, bills matched to orders",
		whyExisting: "Weekly profit summary, bills matched to orders",
	},
	{
		id: "inventory",
		name: "Inventory",
		role: "Stock and suppliers",
		tint: "#fee7c2",
		whyNew: "Add once you hold stock",
		whyExisting: "Flags low stock and drafts reorders",
	},
	{
		id: "market",
		name: "Market researcher",
		role: "Competitors and positioning",
		tint: "#fde2f3",
		whyNew: "Finds your competitors before you launch",
		whyExisting: "Watches how your competitors price and sell",
	},
	{
		id: "website",
		name: "Website builder",
		role: "Landing pages and site updates",
		tint: "#e5e9f0",
		whyNew: "Builds your first landing page from the market report",
		whyExisting: "Updates your site from the market report",
	},
];

const presets = {
	new: ["marketing", "orders", "support"],
	existing: ["orders", "support", "finance", "inventory"],
} as const;

export type BusinessKind = "new" | "existing";

export function defaultSquadIds(kind: BusinessKind): readonly string[] {
	return presets[kind];
}

export function squadById(id: string): SquadChoice | undefined {
	return squadChoices.find((squad) => squad.id === id);
}

export const channelLabels = ["Online store", "Marketplace", "Social", "In person", "Wholesale"] as const;

export const platformLabels: readonly { label: string; dot: string }[] = [
	{ label: "Shopify", dot: "#95bf47" },
	{ label: "WooCommerce", dot: "#7f54b3" },
	{ label: "Amazon", dot: "#ff9900" },
	{ label: "Etsy", dot: "#f1641e" },
	{ label: "TikTok Shop", dot: "#0d0d0d" },
	{ label: "Other", dot: "#8f8f8f" },
];

export const volumeLabels = ["Under 100", "100 to 500", "500 to 2,000", "More than 2,000"] as const;

export const missionExamples = {
	new: [
		"Reach 500 paying customers in year one",
		"Prove the product, then raise prices",
		"Be profitable from month six",
	],
	existing: [
		"Reach $1M a year with repeat customers",
		"Grow 30% without adding staff",
		"Open a second channel by next year",
	],
} as const;

export function summaryLine(count: number): string {
	if (count === 0) {
		return "Pick at least one squad to start.";
	}
	const noun = count === 1 ? " squad" : " squads";
	return `${count}${noun} and one master squad will be created.`;
}
