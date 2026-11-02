import { createServerFn } from "@tanstack/react-start";

interface DecisionBody {
	readonly id: string;
	readonly ok: boolean;
}

function validateDecision(input: unknown): DecisionBody {
	if (typeof input !== "object" || input === null) {
		throw new Error("The decision is not valid.");
	}
	const id = "id" in input ? input.id : undefined;
	const ok = "ok" in input ? input.ok : undefined;
	if (typeof id !== "string" || id.length === 0 || typeof ok !== "boolean") {
		throw new Error("The decision is not valid.");
	}
	return { id, ok };
}

export const loadOverview = createServerFn({ method: "GET" }).handler(async () => {
	const { requireWorkspace } = await import("./workspace-session.ts");
	const { readOverview } = await import("./overview-read.ts");
	return requireWorkspace((scope, db) => readOverview(db, scope));
});

export const decideOverview = createServerFn({ method: "POST" })
	.validator(validateDecision)
	.handler(async ({ data }) => {
		const { requireWorkspace } = await import("./workspace-session.ts");
		return requireWorkspace(async (scope, db) => {
			const { createRepositories } = await import("@tensquads/adapters");
			const { Kernel } = await import("@tensquads/kernel");
			await new Kernel(createRepositories(db)).decide(scope, data.id, data.ok);
		});
	});

export const decideMissionOverview = createServerFn({ method: "POST" })
	.validator(validateDecision)
	.handler(async ({ data }) => {
		const { requireWorkspace } = await import("./workspace-session.ts");
		return requireWorkspace(async (scope, db) => {
			const { createRepositories } = await import("@tensquads/adapters");
			const { Kernel } = await import("@tensquads/kernel");
			await new Kernel(createRepositories(db)).decideMission(scope, data.id, data.ok);
		});
	});
