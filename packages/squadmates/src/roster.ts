// The character belongs to the agent image. A customer cannot rename it.
// `role` is the label on the review sheet. Petra keeps "Master" there so the sheet stays the same.
// `roleTag` is the product tag. Petra's tag is "Master". A screen shows Petra as the name.

export const AGENT_LOOP_STATES = [
	{ id: "waiting", label: "Waiting", hint: "Nothing to do now. Blinks slowly." },
	{ id: "planning", label: "Planning", hint: "Looks up while it plans." },
	{ id: "running", label: "Running skill", hint: "Looks at the work." },
	{ id: "checking", label: "Checking", hint: "Squints while the code check runs." },
	{ id: "done", label: "Done", hint: "The check passed." },
	{ id: "sentback", label: "Sent back", hint: "The check failed once. Looks down." },
	{ id: "blocked", label: "Blocked", hint: "Waits for a person. Holds no machine." },
	{ id: "escalated", label: "Escalated", hint: "Second fail. Needs you now." },
	{ id: "dropped", label: "Dropped", hint: "Nothing to do at all. Asleep." },
] as const;

export type AgentLoopState = (typeof AGENT_LOOP_STATES)[number]["id"];

export type SquadmateProp =
	| "crown"
	| "cap"
	| "headset"
	| "antenna"
	| "visor"
	| "beanie"
	| "glasses"
	| "hardhat"
	| "monocle"
	| "badge";

export type Squadmate = {
	readonly id: string;
	readonly name: string;
	readonly place: string;
	readonly roleTag: string | null;
	readonly role: string;
	readonly tint: string;
	readonly body: string;
	readonly eye?: string;
	readonly prop: SquadmateProp;
	readonly line: string;
};

export const SQUADMATES = [
	{
		id: "master",
		name: "Petra",
		place: "Petra, Jordan",
		roleTag: "Master",
		role: "Master",
		tint: "#e8e8e8",
		body: "#1f1f1f",
		eye: "#ffffff",
		prop: "crown",
		line: "Keeps the squad in sync and asks you only when it matters.",
	},
	{
		id: "orders",
		name: "Pisa",
		place: "Pisa, Italy",
		roleTag: "Orders",
		role: "Orders",
		tint: "#e7efff",
		body: "#5b8def",
		prop: "cap",
		line: "Fulfils orders and chases tracking numbers.",
	},
	{
		id: "support",
		name: "Kyoto",
		place: "Kyoto, Japan",
		roleTag: "Support",
		role: "Support",
		tint: "#def5ee",
		body: "#34b98c",
		prop: "headset",
		line: "Answers the inbox and handles refunds.",
	},
	{
		id: "marketing",
		name: "Rio",
		place: "Rio de Janeiro, Brazil",
		roleTag: "Marketing",
		role: "Marketing",
		tint: "#ece3ff",
		body: "#9a6bf2",
		prop: "antenna",
		line: "Runs ads, social and email.",
	},
	{
		id: "finance",
		name: "Zurich",
		place: "Zurich, Switzerland",
		roleTag: "Finance",
		role: "Finance",
		tint: "#ffefa4",
		body: "#f0bd1d",
		prop: "visor",
		line: "Watches payouts, costs and profit.",
	},
	{
		id: "inventory",
		name: "Giza",
		place: "Giza, Egypt",
		roleTag: "Inventory",
		role: "Inventory",
		tint: "#fee7c2",
		body: "#f39a3d",
		prop: "beanie",
		line: "Counts stock and talks to suppliers.",
	},
	{
		id: "market",
		name: "Machu",
		place: "Machu Picchu, Peru",
		roleTag: "Market researcher",
		role: "Market researcher",
		tint: "#fde2f3",
		body: "#e8679f",
		prop: "glasses",
		line: "Finds the competitors and reads their prices.",
	},
	{
		id: "website",
		name: "Angkor",
		place: "Angkor Wat, Cambodia",
		roleTag: "Website builder",
		role: "Website builder",
		tint: "#e5e9f0",
		body: "#6c7d99",
		prop: "hardhat",
		line: "Builds the page and publishes on your yes.",
	},
	{
		id: "analytics",
		name: "Delphi",
		place: "Delphi, Greece",
		roleTag: "Analytics",
		role: "Analytics",
		tint: "#e7efff",
		body: "#4a6fd1",
		prop: "monocle",
		line: "Writes the reports and the weekly digest.",
	},
	// People uses the design tint #def5ee, the same tint as Support, so the body colour matches.
	{
		id: "hr",
		name: "Sydney",
		place: "Sydney, Australia",
		roleTag: "People",
		role: "People",
		tint: "#def5ee",
		body: "#34b98c",
		prop: "badge",
		line: "Hires people and runs onboarding.",
	},
] as const satisfies readonly Squadmate[];

export type SquadmateId = (typeof SQUADMATES)[number]["id"];
