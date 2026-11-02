import type { ChatEventDraft, ConversationTransaction } from "@tensquads/domain";

export interface BusCommands {
	append(commands: ConversationTransaction, draft: ChatEventDraft): Promise<string>;
}

export function bus(context: { provide(name: string, service: BusCommands): unknown }): void {
	context.provide("workspaceBus", {
		append: (commands, draft) => commands.appendEvent(draft),
	});
}
