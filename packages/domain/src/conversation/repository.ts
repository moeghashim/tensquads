import type { AccountScope } from "../scope.ts";
import type { SendResult, Thread } from "./types.ts";

export interface ConversationRepository {
	thread(scope: AccountScope): Promise<Thread | null>;
	beginSend(scope: AccountScope, text: string): Promise<SendResult>;
	finishSend(scope: AccountScope): Promise<SendResult>;
}
