export interface MessageSent {
	readonly type: "message.sent";
	readonly threadId: string;
	readonly messageId: string;
}

export type ConversationEvent = MessageSent;
