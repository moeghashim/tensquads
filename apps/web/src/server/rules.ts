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

export const setRuleEnabled = createServerFn({ method: "POST" })
	.validator(validateRuleOn)
	.handler(async ({ data }) => {
		const { requireWorkspace } = await import("./workspace-session.ts");
		await requireWorkspace(async (scope, db) => {
			const { createRepositories } = await import("@tensquads/adapters");
			await createRepositories(db).policy.setRuleOn(scope, data.id, data.on);
		});
	});

export const addWorkspaceRule = createServerFn({ method: "POST" })
	.validator(validateDraft)
	.handler(async ({ data }) => {
		const { requireWorkspace } = await import("./workspace-session.ts");
		await requireWorkspace(async (scope, db) => {
			const { createRepositories } = await import("@tensquads/adapters");
			await createRepositories(db).policy.addRule(scope, data);
		});
	});

export const setRuleLimit = createServerFn({ method: "POST" })
	.validator(validateLimit)
	.handler(async ({ data }) => {
		const { requireWorkspace } = await import("./workspace-session.ts");
		await requireWorkspace(async (scope, db) => {
			const { createRepositories } = await import("@tensquads/adapters");
			await createRepositories(db).policy.setLimit(scope, data.key, data.value);
		});
	});

function numberLimit(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error("The limit is missing.");
	}
	return value;
}

function isRecord(input: unknown): input is Record<string, unknown> {
	return typeof input === "object" && input !== null;
}

function validateRuleOn(input: unknown): { readonly id: string; readonly on: boolean } {
	if (!isRecord(input) || typeof input.id !== "string" || input.id.length === 0 || typeof input.on !== "boolean") {
		throw new Error("The rule change is not valid.");
	}
	return { id: input.id, on: input.on };
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

function validateLimit(input: unknown): { readonly key: string; readonly value: number } {
	if (!isRecord(input) || typeof input.key !== "string" || input.key.length === 0 || typeof input.value !== "number") {
		throw new Error("The limit change is not valid.");
	}
	return { key: input.key, value: input.value };
}
