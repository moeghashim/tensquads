import { createServerFn } from "@tanstack/react-start";
import type { BusNamespace } from "@tensquads/adapters";
import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";
import type { AccountScope } from "@tensquads/domain";
import type { Kernel } from "@tensquads/kernel";

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
	.handler(overviewDecision("decide"));

export const decideMissionOverview = createServerFn({ method: "POST" })
	.validator(validateDecision)
	.handler(overviewDecision("decideMission"));

async function accountNamespace(): Promise<BusNamespace | undefined> {
	try {
		const workers = await import("cloudflare:workers");
		const env = (workers.env ?? {}) as { ACCOUNT_BUS?: BusNamespace };
		return env.ACCOUNT_BUS;
	} catch {
		return undefined;
	}
}

function overviewDecision(kind: "decide" | "decideMission") {
	return async ({ data }: { data: DecisionBody }) => {
		const startedAt = Date.now();
		const { requireWorkspace } = await import("./workspace-session.ts");
		return requireWorkspace(
			async (scope, db) => {
				const { createRepositories } = await import("@tensquads/adapters");
				const { Kernel } = await import("@tensquads/kernel");
				const kernel = new Kernel(createRepositories(db, await accountNamespace()));
				const deadline = startedAt + PENDING_TASK_WINDOW_MS;
				return runOverviewDecision(kind, kernel, scope, data, deadline);
			},
			{ accountId: data.accountId, startedAt },
		);
	};
}

function runOverviewDecision(
	kind: "decide" | "decideMission",
	kernel: Kernel,
	scope: AccountScope,
	data: DecisionBody,
	deadline: number,
) {
	if (kind === "decideMission") return kernel.decideMission(scope, data.id, data.ok, deadline);
	return kernel.decide(scope, data.id, data.ok, deadline);
}
