// An inbound event is a Trigger from a Source.
// Eval decides whether that Trigger starts work: a code gate, then a Decider judgement.

export interface Source {
	readonly name: "chat";
}

export const chatSource: Source = { name: "chat" };

export interface Trigger {
	readonly source: Source;
	readonly accountId: string;
	readonly text: string;
}

export interface Eval {
	readonly gate: boolean;
	// Decision 19: the Decider has no adapter in version 1, so this stays empty. No model call.
	readonly judgement: null;
}

export function chatTrigger(accountId: string, text: string): Trigger {
	return { source: chatSource, accountId, text };
}

export function evalChatTrigger(trigger: Trigger, ownerAccountId: string): Eval {
	const gate = trigger.source.name === chatSource.name && trigger.accountId === ownerAccountId;
	return { gate, judgement: null };
}
