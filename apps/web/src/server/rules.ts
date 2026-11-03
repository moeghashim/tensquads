import { createServerFn } from "@tanstack/react-start";

export interface RulesLimit {
	readonly id: string;
	readonly key: string;
	readonly label: string;
	readonly min: number;
	readonly max: number;
	readonly step: number;
	readonly value: number;
}

export interface RulesRule {
	readonly id: string;
	readonly when: string;
	readonly agent: string;
	readonly action: string;
	readonly approval: string;
	readonly on: boolean;
}

export interface RulesPageData {
	readonly rules: readonly RulesRule[];
	readonly limits: readonly RulesLimit[];
}

export const loadRulesPage = createServerFn({ method: "GET" }).handler(async (): Promise<RulesPageData> => {
	const { requireWorkspace } = await import("./workspace-session.ts");
	return requireWorkspace(async (scope, db) => {
		const { createRepositories } = await import("@tensquads/adapters");
		const { limitDefinitions } = await import("../../../../packages/kernel/src/plugins/policy-rules.ts");
		const repositories = createRepositories(db);
		const [rules, store] = await Promise.all([
			repositories.policy.listRules(scope),
			repositories.bus.readStore(scope),
		]);
		return {
			rules,
			limits: limitDefinitions.map((definition) => ({
				...definition,
				value: numberLimit(store[definition.key]),
			})),
		};
	});
});

export interface RulesLimitValue {
	readonly key: string;
	readonly value: number;
}

export interface RulesWrite<T> {
	readonly status: "written" | "superseded";
	readonly row: T;
}

export const setRuleEnabled = createServerFn({ method: "POST" })
	.validator(validateRuleOn)
	.handler(async ({ data }): Promise<RulesWrite<RulesRule>> => {
		return writeThroughKernel((kernel, scope, deadlineAt) =>
			kernel.setRuleOn(scope, data.id, data.on, { tab: data.tab, seq: data.seq, retires: data.retires }, deadlineAt),
		);
	});

export const addWorkspaceRule = createServerFn({ method: "POST" })
	.validator(validateDraft)
	.handler(async ({ data }): Promise<RulesRule | null> => {
		return writeThroughKernel((kernel, scope, deadlineAt) => kernel.addRule(scope, data, deadlineAt));
	});

export const setRuleLimit = createServerFn({ method: "POST" })
	.validator(validateLimit)
	.handler(async ({ data }): Promise<RulesWrite<RulesLimitValue>> => {
		return writeThroughKernel((kernel, scope, deadlineAt) =>
			kernel.setLimit(
				scope,
				data.key,
				data.value,
				{ tab: data.tab, seq: data.seq, retires: data.retires },
				deadlineAt,
			),
		);
	});

async function writeThroughKernel<T>(
	work: (
		kernel: {
			setRuleOn(
				scope: { accountId: string; mode: "account" },
				id: string,
				on: boolean,
				fence: { tab: string; seq: number; retires: readonly string[] },
				deadlineAt: number,
			): Promise<RulesWrite<RulesRule>>;
			addRule(
				scope: { accountId: string; mode: "account" },
				draft: { when: string; agent: string; action: string; approval: string },
				deadlineAt: number,
			): Promise<RulesRule | null>;
			setLimit(
				scope: { accountId: string; mode: "account" },
				key: string,
				value: number,
				fence: { tab: string; seq: number; retires: readonly string[] },
				deadlineAt: number,
			): Promise<RulesWrite<RulesLimitValue>>;
		},
		scope: { accountId: string; mode: "account" },
		deadlineAt: number,
	) => Promise<T>,
): Promise<T> {
	const startedAt = Date.now();
	const { requireWorkspace } = await import("./workspace-session.ts");
	const { PENDING_TASK_WINDOW_MS } = await import("@tensquads/adapters/pending-window");
	return requireWorkspace(async (scope, db) => {
		const { createRepositories } = await import("@tensquads/adapters");
		const { Kernel } = await import("@tensquads/kernel");
		return work(new Kernel(createRepositories(db)), scope, startedAt + PENDING_TASK_WINDOW_MS);
	}, startedAt);
}

function numberLimit(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error("The limit is missing.");
	}
	return value;
}

function isRecord(input: unknown): input is Record<string, unknown> {
	return typeof input === "object" && input !== null;
}

function validateRuleOn(input: unknown): {
	readonly id: string;
	readonly on: boolean;
	readonly tab: string;
	readonly seq: number;
	readonly retires: readonly string[];
} {
	if (!isRecord(input) || typeof input.id !== "string" || input.id.length === 0 || typeof input.on !== "boolean") {
		throw new Error("The rule change is not valid.");
	}
	const fence = validateFence(input);
	return { id: input.id, on: input.on, tab: fence.tab, seq: fence.seq, retires: fence.retires };
}

function validateDraft(input: unknown): {
	readonly when: string;
	readonly agent: string;
	readonly action: string;
	readonly approval: string;
} {
	if (
		!isRecord(input) ||
		typeof input.when !== "string" ||
		typeof input.agent !== "string" ||
		typeof input.action !== "string" ||
		typeof input.approval !== "string"
	) {
		throw new Error("The new rule is not valid.");
	}
	return { when: input.when, agent: input.agent, action: input.action, approval: input.approval };
}

function validateLimit(input: unknown): {
	readonly key: string;
	readonly value: number;
	readonly tab: string;
	readonly seq: number;
	readonly retires: readonly string[];
} {
	if (!isRecord(input) || typeof input.key !== "string" || input.key.length === 0 || typeof input.value !== "number") {
		throw new Error("The limit change is not valid.");
	}
	const fence = validateFence(input);
	return { key: input.key, value: input.value, tab: fence.tab, seq: fence.seq, retires: fence.retires };
}

function validateFence(input: Record<string, unknown>): {
	readonly tab: string;
	readonly seq: number;
	readonly retires: readonly string[];
} {
	const { tab, seq } = input;
	if (typeof tab !== "string" || tab.length === 0 || tab.length > 80 || tab !== tab.trim()) {
		throw new Error("The write fence is not valid.");
	}
	if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 1) {
		throw new Error("The write fence is not valid.");
	}
	return { tab, seq, retires: validateRetires(input.retires) };
}

function validateRetires(input: unknown): readonly string[] {
	if (input === undefined) return [];
	if (!Array.isArray(input)) {
		throw new Error("The write fence is not valid.");
	}
	const retires: string[] = [];
	for (const id of input) {
		if (typeof id !== "string" || id.length === 0 || id.length > 80 || id !== id.trim()) {
			throw new Error("The write fence is not valid.");
		}
		if (!retires.includes(id)) retires.push(id);
	}
	return retires;
}
