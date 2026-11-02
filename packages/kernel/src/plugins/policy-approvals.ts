import type { AccountScope } from "@tensquads/domain";

export interface PolicyApprovalCommands {
	decide(scope: AccountScope, id: string, ok: boolean): Promise<void>;
	decideMission(scope: AccountScope, id: string, ok: boolean): Promise<void>;
}

export interface PolicyApprovalConfig {
	repositories(): unknown;
}

interface PolicyBag {
	readonly policy: {
		decide(scope: AccountScope, id: string, ok: boolean): Promise<void>;
		decideMission(scope: AccountScope, id: string, ok: boolean): Promise<void>;
	};
}

export function policyApprovals(
	context?: { provide(name: string, service: PolicyApprovalCommands): unknown },
	config?: PolicyApprovalConfig,
): void {
	if (!context) return;
	context.provide("policyApprovals", {
		decide(scope, id, ok) {
			return policyBag(config).policy.decide(scope, id, ok);
		},
		decideMission(scope, id, ok) {
			return policyBag(config).policy.decideMission(scope, id, ok);
		},
	});
}

function policyBag(config: PolicyApprovalConfig | undefined): PolicyBag {
	if (!config) throw new Error("Repositories are not configured.");
	const repos = config.repositories();
	if (!isPolicyBag(repos)) throw new Error("Repositories are not configured.");
	return repos;
}

function isPolicyBag(value: unknown): value is PolicyBag {
	if (!value || typeof value !== "object") return false;
	const policy = (value as { policy?: unknown }).policy;
	if (!policy || typeof policy !== "object") return false;
	const commands = policy as { decide?: unknown; decideMission?: unknown };
	return typeof commands.decide === "function" && typeof commands.decideMission === "function";
}
