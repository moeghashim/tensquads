import type { BusKind } from "../bus/types.ts";
import type { AccountScope } from "../scope.ts";
import type { Message, MessageFrom, Thread } from "./types.ts";

export interface ChatEventDraft {
	readonly from: string;
	readonly to: string;
	readonly kind: BusKind;
	readonly skill: string;
	readonly text: string;
	readonly payload: Readonly<Record<string, unknown>>;
	readonly writes?: readonly string[];
}

export interface PendingChatTask {
	readonly id: string;
	readonly toAgent: string;
	readonly skill: string;
}

export interface ConversationTransaction {
	pendingTask(): Promise<PendingChatTask | null>;
	agent(id: string): Promise<{ readonly id: string; readonly name: string; readonly isOn: boolean } | null>;
	skills(id: string): Promise<readonly { readonly id: string; readonly on: boolean }[]>;
	store(): Promise<Readonly<Record<string, unknown>>>;
	message(from: MessageFrom, text: string, agent?: string): Promise<void>;
	messages(): Promise<readonly Message[]>;
	appendEvent(draft: ChatEventDraft): Promise<string>;
	completeAgent(id: string, text: string): Promise<void>;
}

export interface ConversationRepository {
	thread(scope: AccountScope): Promise<Thread | null>;
	transaction<T>(scope: AccountScope, work: (commands: ConversationTransaction) => Promise<T>): Promise<T>;
}
