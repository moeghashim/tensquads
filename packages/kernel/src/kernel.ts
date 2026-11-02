import type { AccountScope, SendResult } from "@tensquads/domain";
import { Context } from "cordis";
import type { BusCommands } from "./plugins/bus.ts";
import type { ConversationCommands } from "./plugins/conversation.ts";
import { conversation } from "./plugins/conversation.ts";

import { plugins } from "./plugins/index.ts";
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
