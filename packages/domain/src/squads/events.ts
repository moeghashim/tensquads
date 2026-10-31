export interface AgentToggled {
	readonly type: "agent.toggled";
	readonly accountId: string;
	readonly agentId: string;
	readonly on: boolean;
}

export type SquadsEvent = AgentToggled;
