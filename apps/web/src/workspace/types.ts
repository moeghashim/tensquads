export interface FrameAgent {
	readonly id: string;
	readonly name: string;
	readonly tint: string;
	readonly on: boolean;
}

export interface FrameMessage {
	readonly id: string;
	readonly from: "user" | "master" | "agent";
	readonly agent?: string;
	readonly text: string;
}

export interface WorkspaceFrameData {
	readonly accountName: string;
	readonly owner: string;
	readonly masterName: string;
	readonly agents: readonly FrameAgent[];
	readonly approvalCount: number;
	readonly messages: readonly FrameMessage[];
}

export interface RuleForm {
	readonly when: string;
	readonly agent: string;
	readonly action: string;
	readonly approval: string;
}

export interface SendStart {
	readonly kind: "ignored" | "answered" | "working" | "replied";
	readonly messages?: readonly FrameMessage[];
	readonly agentName?: string;
}
