import type {
	AccountScope,
	Autonomy,
	Fenced,
	Rule,
	SendResult,
	StoredAgentOn,
	StoredAutonomy,
	StoredLimit,
	StoredSkillOn,
	WriteFence,
	WrittenDecision,
} from "@tensquads/domain";
import { Context } from "cordis";
import { type BusCommands, bus } from "./plugins/bus.ts";
import type { ConversationCommands } from "./plugins/conversation.ts";
import { conversation } from "./plugins/conversation.ts";
import { plugins } from "./plugins/index.ts";
import type { PolicyCommands } from "./plugins/policy.ts";
import { policy } from "./plugins/policy.ts";
import type { PolicyApprovalCommands } from "./plugins/policy-approvals.ts";
import { type SquadCommands, squads } from "./plugins/squads.ts";
import {
	DECIDER_MISSING,
	type Decider,
	type Decision,
	type EventBus,
	type IntegrationGateway,
	type MachineProvider,
	type Repositories,
} from "./ports.ts";

export class Kernel {
	readonly context: Context;
	machine: MachineProvider | null = null;
	bus: EventBus | null = null;
	gateway: IntegrationGateway | null = null;
	repositories: Repositories | null = null;
	readonly decider: Decider;
	private readonly ready: Promise<unknown>;

	constructor(repositories: Repositories | null = null) {
		this.repositories = repositories;
		this.context = new Context();
		const fibers = [];
		for (const plugin of plugins) {
			if (plugin === conversation) {
				fibers.push(
					this.context.plugin(conversation, {
						repositories: () => {
							if (!this.repositories) throw new Error("Repositories are not configured.");
							return this.repositories;
						},
						bus: () => this.context.get("workspaceBus") as BusCommands,
					}),
				);
			} else if (plugin === bus) {
				fibers.push(
					this.context.plugin(bus, { nextEvent: (scope, deadlineAt) => this.advance(scope, deadlineAt) }),
				);
			} else if (plugin === policy) {
				fibers.push(
					this.context.plugin(policy, {
						repositories: () => {
							if (!this.repositories) throw new Error("Repositories are not configured.");
							return this.repositories;
						},
					}),
				);
			} else if (plugin === squads) {
				fibers.push(
					this.context.plugin(squads, {
						repositories: () => {
							if (!this.repositories) throw new Error("Repositories are not configured.");
							return this.repositories;
						},
					}),
				);
			} else {
				fibers.push(this.context.plugin(plugin));
			}
		}
		this.ready = Promise.all(fibers.map((fiber) => fiber.await()));
		this.decider = {
			decide(_question: string, _answers: readonly string[]): Decision {
				throw new Error(DECIDER_MISSING);
			},
		};
	}

	async beginSend(scope: AccountScope, text: string): Promise<SendResult> {
		await this.ready;
		return (this.context.get("workspaceConversation") as ConversationCommands).beginSend(scope, text);
	}

	async finishSend(scope: AccountScope, taskId: string): Promise<SendResult> {
		await this.ready;
		return (this.context.get("workspaceConversation") as ConversationCommands).finishSend(scope, taskId);
	}

	// fallow-ignore-next-line unused-class-member
	async setAgentOn(
		scope: AccountScope,
		agentId: string,
		on: boolean,
		fence: WriteFence,
		deadlineAt: number,
	): Promise<Fenced<StoredAgentOn>> {
		await this.ready;
		return (this.context.get("workspaceSquads") as SquadCommands).setAgentOn(scope, agentId, on, fence, deadlineAt);
	}

	// fallow-ignore-next-line unused-class-member
	async setSkillOn(
		scope: AccountScope,
		agentId: string,
		skillId: string,
		on: boolean,
		fence: WriteFence,
		deadlineAt: number,
	): Promise<Fenced<StoredSkillOn>> {
		await this.ready;
		return (this.context.get("workspaceSquads") as SquadCommands).setSkillOn(
			scope,
			agentId,
			skillId,
			on,
			fence,
			deadlineAt,
		);
	}

	// fallow-ignore-next-line unused-class-member
	async setAutonomy(
		scope: AccountScope,
		agentId: string,
		autonomy: Autonomy,
		fence: WriteFence,
		deadlineAt: number,
	): Promise<Fenced<StoredAutonomy>> {
		await this.ready;
		return (this.context.get("workspaceSquads") as SquadCommands).setAutonomy(
			scope,
			agentId,
			autonomy,
			fence,
			deadlineAt,
		);
	}

	// fallow-ignore-next-line unused-class-member
	async askRevise(scope: AccountScope, agentId: string, deadlineAt: number): Promise<void> {
		await this.ready;
		return (this.context.get("workspaceSquads") as SquadCommands).askRevise(scope, agentId, deadlineAt);
	}

	async nextEvent(scope: AccountScope, deadlineAt?: number): Promise<void> {
		await this.ready;
		return (this.context.get("workspaceBus") as BusCommands).nextEvent(scope, deadlineAt);
	}

	// ports.ts lists no nextEvent. The repository bag has it. The cast stays on this call.
	private advance(scope: AccountScope, deadlineAt?: number): Promise<void> {
		if (!this.repositories) throw new Error("Repositories are not configured.");
		const port = this.repositories.bus as unknown as {
			nextEvent(scope: AccountScope, deadlineAt?: number): Promise<void>;
		};
		return port.nextEvent(scope, deadlineAt);
	}

	async setRuleOn(
		scope: AccountScope,
		id: string,
		on: boolean,
		fence: WriteFence,
		deadlineAt?: number,
	): Promise<Fenced<Rule>> {
		await this.ready;
		return (this.context.get("workspacePolicy") as PolicyCommands).setRuleOn(scope, id, on, fence, deadlineAt);
	}

	async addRule(
		scope: AccountScope,
		draft: Parameters<PolicyCommands["addRule"]>[1],
		deadlineAt?: number,
	): Promise<Rule | null> {
		await this.ready;
		return (this.context.get("workspacePolicy") as PolicyCommands).addRule(scope, draft, deadlineAt);
	}

	async setLimit(
		scope: AccountScope,
		key: string,
		value: number,
		fence: WriteFence,
		deadlineAt?: number,
	): Promise<Fenced<StoredLimit>> {
		await this.ready;
		return (this.context.get("workspacePolicy") as PolicyCommands).setLimit(scope, key, value, fence, deadlineAt);
	}

	async decide(scope: AccountScope, id: string, ok: boolean, deadlineAt?: number): Promise<WrittenDecision> {
		await this.ready;
		return this.approvals().decide(scope, id, ok, deadlineAt);
	}

	async decideMission(scope: AccountScope, id: string, ok: boolean, deadlineAt?: number): Promise<WrittenDecision> {
		await this.ready;
		return this.approvals().decideMission(scope, id, ok, deadlineAt);
	}

	private approvals(): PolicyApprovalCommands {
		return this.context.get("policyApprovals") as PolicyApprovalCommands;
	}

	pluginNames(): readonly string[] {
		const names: string[] = [];
		for (const plugin of this.context.registry.keys()) {
			if (plugin.name.length > 0) {
				names.push(plugin.name);
			}
		}
		return names;
	}
}
