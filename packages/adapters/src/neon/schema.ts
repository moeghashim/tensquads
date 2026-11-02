import { boolean, foreignKey, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

// Column names that cannot be the design field: is_on (on), last_text (last), description (desc),
// time_text (time), from_agent (from), to_agent (to), body (text), from_role (from), rule_when (when).
// `when` is a SQL keyword. `from` is reserved. Catalog tables have no account_id.

export const accounts = pgTable("accounts", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	name: text("name").notNull(),
	owner: text("owner").notNull(),
	email: text("email").notNull(),
	clerkUserId: text("clerk_user_id"),
	tint: text("tint").notNull(),
	agents: integer("agents").notNull(),
	online: integer("online").notNull(),
	tasks: integer("tasks").notNull(),
	lastActive: text("last_active").notNull(),
	createdWeek: integer("created_week").notNull(),
	mission: text("mission").notNull(),
	sortOrder: integer("sort_order").notNull(),
});

export const plans = pgTable("plans", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	monthly: integer("monthly").notNull(),
	sortOrder: integer("sort_order").notNull(),
});

export const subscriptions = pgTable("subscriptions", {
	accountId: text("account_id").primaryKey(),
	plan: text("plan").notNull(),
	status: text("status").notNull(),
	mrr: integer("mrr").notNull(),
	ltv: integer("ltv").notNull(),
	started: text("started").notNull(),
	sortOrder: integer("sort_order").notNull(),
});

export const squads = pgTable(
	"squads",
	{
		accountId: text("account_id").notNull(),
		id: text("id").notNull(),
		name: text("name").notNull(),
		sortOrder: integer("sort_order").notNull(),
	},
	(table) => [primaryKey({ columns: [table.accountId, table.id] })],
);

export const masters = pgTable("masters", {
	accountId: text("account_id").primaryKey(),
	name: text("name").notNull(),
	sortOrder: integer("sort_order").notNull(),
});

export const agents = pgTable(
	"agents",
	{
		accountId: text("account_id").notNull(),
		id: text("id").notNull(),
		name: text("name").notNull(),
		role: text("role").notNull(),
		tint: text("tint").notNull(),
		isOn: boolean("is_on").notNull(),
		autonomy: text("autonomy").notNull(),
		mission: text("mission").notNull(),
		contribution: integer("contribution").notNull(),
		tasks: integer("tasks").notNull(),
		success: text("success").notNull(),
		saved: text("saved").notNull(),
		lastText: text("last_text").notNull(),
		targets: jsonb("targets").$type<readonly (readonly [string, string, string])[]>().notNull(),
		kpis: jsonb("kpis").$type<readonly (readonly [string, string])[]>().notNull(),
		sortOrder: integer("sort_order").notNull(),
	},
	(table) => [primaryKey({ columns: [table.accountId, table.id] })],
);

export const machines = pgTable(
	"machines",
	{
		accountId: text("account_id").notNull(),
		agentId: text("agent_id").notNull(),
		host: text("host").notNull(),
		region: text("region").notNull(),
		size: text("size").notNull(),
		cpu: text("cpu").notNull(),
		uptime: text("uptime").notNull(),
		egress: jsonb("egress").$type<readonly string[]>().notNull(),
		secrets: jsonb("secrets").$type<readonly string[]>().notNull(),
		sortOrder: integer("sort_order").notNull(),
	},
	(table) => [primaryKey({ columns: [table.accountId, table.agentId] })],
);

export const skills = pgTable(
	"skills",
	{
		accountId: text("account_id").notNull(),
		agentId: text("agent_id").notNull(),
		id: text("id").notNull(),
		description: text("description").notNull(),
		gate: text("gate").notNull(),
		runs: integer("runs").notNull(),
		isOn: boolean("is_on").notNull(),
		sortOrder: integer("sort_order").notNull(),
	},
	(table) => [primaryKey({ columns: [table.accountId, table.agentId, table.id] })],
);

export const busCursors = pgTable("bus_cursors", {
	accountId: text("account_id")
		.primaryKey()
		.references(() => accounts.id),
	seq: integer("seq").notNull(),
	clock: integer("clock").notNull(),
	scriptIndex: integer("script_index").notNull(),
});

export const busEvents = pgTable(
	"bus_events",
	{
		accountId: text("account_id").notNull(),
		id: text("id").notNull(),
		timeText: text("time_text").notNull(),
		occurredAt: timestamp("occurred_at", { withTimezone: true }),
		fromAgent: text("from_agent").notNull(),
		toAgent: text("to_agent").notNull(),
		kind: text("kind").notNull(),
		skill: text("skill").notNull(),
		body: text("body").notNull(),
		payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
		writes: jsonb("writes").$type<readonly string[]>().notNull(),
		trace: text("trace").notNull(),
		seq: integer("seq").notNull(),
	},
	(table) => [primaryKey({ columns: [table.accountId, table.id] })],
);

export const stateEntries = pgTable(
	"state_entries",
	{
		accountId: text("account_id").notNull(),
		key: text("key").notNull(),
		value: text("value").notNull(),
		sortOrder: integer("sort_order").notNull(),
	},
	(table) => [primaryKey({ columns: [table.accountId, table.key] })],
);

export const rules = pgTable(
	"rules",
	{
		accountId: text("account_id").notNull(),
		id: text("id").notNull(),
		ruleWhen: text("rule_when").notNull(),
		agent: text("agent").notNull(),
		action: text("action").notNull(),
		approval: text("approval").notNull(),
		isOn: boolean("is_on").notNull(),
		sortOrder: integer("sort_order").notNull(),
	},
	(table) => [primaryKey({ columns: [table.accountId, table.id] })],
);

export const approvals = pgTable(
	"approvals",
	{
		accountId: text("account_id").notNull(),
		id: text("id").notNull(),
		agent: text("agent").notNull(),
		title: text("title").notNull(),
		detail: text("detail").notNull(),
		amount: text("amount").notNull(),
		status: text("status").notNull(),
		sortOrder: integer("sort_order").notNull(),
	},
	(table) => [primaryKey({ columns: [table.accountId, table.id] })],
);

// One Mandate per Approval. The row is a copy of the rule at the moment a person says yes.
// Pending and Declined approvals have no row. The repository has no update.
export const mandates = pgTable(
	"mandates",
	{
		accountId: text("account_id")
			.notNull()
			.references(() => accounts.id, { onDelete: "cascade" }),
		approvalId: text("approval_id").notNull(),
		ruleId: text("rule_id").notNull(),
		ruleWhen: text("rule_when").notNull(),
		ruleAction: text("rule_action").notNull(),
		ruleApproval: text("rule_approval").notNull(),
		limitValue: integer("limit_value").notNull(),
		policyVersion: text("policy_version").notNull(),
		saidYes: text("said_yes").notNull(),
		saidAt: timestamp("said_at", { withTimezone: true }).notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.accountId, table.approvalId] }),
		foreignKey({
			columns: [table.accountId, table.approvalId],
			foreignColumns: [approvals.accountId, approvals.id],
		}).onDelete("cascade"),
	],
);

export const missionProposals = pgTable(
	"mission_proposals",
	{
		accountId: text("account_id").notNull(),
		id: text("id").notNull(),
		agent: text("agent").notNull(),
		mission: text("mission").notNull(),
		targets: jsonb("targets").$type<readonly (readonly [string, string])[]>().notNull(),
		status: text("status").notNull(),
		sortOrder: integer("sort_order").notNull(),
	},
	(table) => [primaryKey({ columns: [table.accountId, table.id] })],
);

export const dailyRevenue = pgTable(
	"daily_revenue",
	{
		accountId: text("account_id").notNull(),
		day: text("day").notNull(),
		amount: integer("amount").notNull(),
		sortOrder: integer("sort_order").notNull(),
	},
	(table) => [primaryKey({ columns: [table.accountId, table.day] })],
);

export const overviewTiles = pgTable("overview_tiles", {
	accountId: text("account_id").primaryKey(),
	tiles: jsonb("tiles")
		.$type<readonly { label: string; value: string; delta: string; deltaColor: string }[]>()
		.notNull(),
});

export const threads = pgTable(
	"threads",
	{
		accountId: text("account_id").notNull(),
		id: text("id").notNull(),
		sortOrder: integer("sort_order").notNull(),
	},
	(table) => [primaryKey({ columns: [table.accountId, table.id] })],
);

export const messages = pgTable(
	"messages",
	{
		accountId: text("account_id").notNull(),
		threadId: text("thread_id").notNull(),
		id: text("id").notNull(),
		fromRole: text("from_role").notNull(),
		agent: text("agent"),
		body: text("body").notNull(),
		sortOrder: integer("sort_order").notNull(),
	},
	(table) => [primaryKey({ columns: [table.accountId, table.id] })],
);

export const agentImages = pgTable("agent_images", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	role: text("role").notNull(),
	tint: text("tint").notNull(),
	tag: text("tag").notNull(),
	version: text("version").notNull(),
	nextVersion: text("next_version").notNull(),
	updated: text("updated").notNull(),
	updatedFull: text("updated_full").notNull(),
	deployed: integer("deployed").notNull(),
	onLatest: integer("on_latest").notNull(),
	status: text("status").notNull(),
	sortOrder: integer("sort_order").notNull(),
});

export const bugs = pgTable("bugs", {
	id: text("id").primaryKey(),
	imageId: text("image_id").notNull(),
	sev: text("sev").notNull(),
	title: text("title").notNull(),
	age: text("age").notNull(),
	reports: integer("reports").notNull(),
	sortOrder: integer("sort_order").notNull(),
});

export const featureRequests = pgTable("feature_requests", {
	id: text("id").primaryKey(),
	imageId: text("image_id").notNull(),
	title: text("title").notNull(),
	votes: integer("votes").notNull(),
	stage: text("stage").notNull(),
	sortOrder: integer("sort_order").notNull(),
});

export const schema = {
	accounts,
	plans,
	subscriptions,
	squads,
	masters,
	agents,
	machines,
	skills,
	busCursors,
	busEvents,
	stateEntries,
	rules,
	approvals,
	mandates,
	missionProposals,
	dailyRevenue,
	overviewTiles,
	threads,
	messages,
	agentImages,
	bugs,
	featureRequests,
};
