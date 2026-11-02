export interface AgentCardSkill {
	readonly id: string;
	readonly on: boolean;
}

export interface AgentCardData {
	readonly id: string;
	readonly name: string;
	readonly role: string;
	readonly tint: string;
	readonly on: boolean;
	readonly autonomy: string;
	readonly mission: string;
	readonly contribution: number;
	readonly tasks: number;
	readonly success: string;
	readonly host: string;
	readonly region: string;
	readonly skills: readonly AgentCardSkill[];
}

export interface AgentsPageData {
	readonly masterName: string;
	readonly agents: readonly AgentCardData[];
}
