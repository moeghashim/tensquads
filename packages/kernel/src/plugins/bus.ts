import type {
	AccountScope,
	AppendedChatEvent,
	BusEvent,
	ChatEventDraft,
	ConversationTransaction,
} from "@tensquads/domain";

export interface BusCommands {
	append(commands: ConversationTransaction, draft: ChatEventDraft): Promise<AppendedChatEvent>;

	nextEvent(scope: AccountScope, deadlineAt?: number): Promise<BusEvent | undefined>;
}

export function bus(
	context: { provide(name: string, service: BusCommands): unknown },
	config?: { nextEvent(scope: AccountScope, deadlineAt?: number): Promise<BusEvent | undefined> },
): void {
	context.provide("workspaceBus", {
		append: (commands, draft) => commands.appendEvent(draft),
		nextEvent(scope, deadlineAt) {
			if (!config) throw new Error("Repositories are not configured.");
			return config.nextEvent(scope, deadlineAt);
		},
	});
}
