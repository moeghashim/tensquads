export type MessageFrom = "user" | "master" | "agent";

export interface Message {
	readonly id: string;
	readonly from: MessageFrom;
	readonly agent?: string;
	readonly text: string;
}

export interface Thread {
	readonly id: string;
	readonly messages: readonly Message[];
}
