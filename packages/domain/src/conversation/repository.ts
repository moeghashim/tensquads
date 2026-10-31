import type { AccountScope } from "../scope.ts";
import type { Thread } from "./types.ts";

export interface ConversationRepository {
	thread(scope: AccountScope): Promise<Thread | null>;
}
