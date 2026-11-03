import { createServerFn } from "@tanstack/react-start";
import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";

interface DecisionBody {
	readonly accountId: string;
	readonly id: string;
	readonly ok: boolean;
}

function validateDecision(input: unknown): DecisionBody {
	if (typeof input !== "object" || input === null) {
		throw new Error("The decision is not valid.");
	}
	const accountId = "accountId" in input ? input.accountId : undefined;
	const id = "id" in input ? input.id : undefined;
	const ok = "ok" in input ? input.ok : undefined;
	if (
		typeof accountId !== "string" ||
		accountId.length === 0 ||
		typeof id !== "string" ||
		id.length === 0 ||
		typeof ok !== "boolean"
	) {
		throw new Error("The decision is not valid.");
	}
	return { accountId, id, ok };
}

export const loadOverview = createServerFn({ method: "GET" }).handler(async () => {
	const { requireWorkspace } = await import("./workspace-session.ts");
	const { readOverview } = await import("./overview-read.ts");
	return requireWorkspace((scope, db) => readOverview(db, scope));
});

export const decideOverview = createServerFn({ method: "POST" })
	.validator(validateDecision)
	.handler(async ({ data }) => {
		const startedAt = Date.now();
		const { requireWorkspace } = await import("./workspace-session.ts");
		return requireWorkspace(
			async (scope, db) => {
				const { createRepositories } = await import("@tensquads/adapters");
				const { Kernel } = await import("@tensquads/kernel");
				return new Kernel(createRepositories(db)).decide(
					scope,
					data.id,
					data.ok,
					startedAt + PENDING_TASK_WINDOW_MS,
				);
			},
			{ accountId: data.accountId, startedAt },
		);
	});

export const decideMissionOverview = createServerFn({ method: "POST" })
	.validator(validateDecision)
	.handler(async ({ data }) => {
		const startedAt = Date.now();
		const { requireWorkspace } = await import("./workspace-session.ts");
		return requireWorkspace(
			async (scope, db) => {
				const { createRepositories } = await import("@tensquads/adapters");
				const { Kernel } = await import("@tensquads/kernel");
				return new Kernel(createRepositories(db)).decideMission(
					scope,
					data.id,
					data.ok,
					startedAt + PENDING_TASK_WINDOW_MS,
				);
			},
			{ accountId: data.accountId, startedAt },
		);
	});
