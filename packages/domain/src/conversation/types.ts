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

export type SendResult =
	| { readonly kind: "ignored" }
	| { readonly kind: "answered"; readonly messages: readonly Message[] }
	| {
			readonly kind: "working";
			readonly agentId: string;
			readonly agentName: string;
			readonly skill: string;
			readonly text: string;
			readonly messages: readonly Message[];
	  }
	| { readonly kind: "replied"; readonly messages: readonly Message[] };
