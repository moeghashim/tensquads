export type Autonomy = "Ask first" | "Auto under limit" | "Full auto";

export type SkillGate = "Auto" | "Ask first" | "Under limit";

export interface Squad {
	readonly id: string;
	readonly accountId: string;
	readonly name: string;
}

export interface Skill {
	readonly id: string;
	readonly desc: string;
	readonly gate: SkillGate;
	readonly runs: number;
	readonly on: boolean;
}

export interface Machine {
	readonly host: string;
	readonly region: string;
	readonly size: string;
	readonly cpu: string;
	readonly uptime: string;
	readonly egress: readonly string[];
	readonly secrets: readonly string[];
}

export interface Agent {
	readonly id: string;
	readonly name: string;
	readonly role: string;
	readonly tint: string;
	readonly on: boolean;
	readonly autonomy: Autonomy;
	readonly mission: string;
	readonly targets: readonly (readonly [string, string, string])[];
	readonly contribution: number;
	readonly tasks: number;
	readonly success: string;
	readonly saved: string;
	readonly last: string;
	readonly host: string;
	readonly region: string;
	readonly size: string;
	readonly cpu: string;
	readonly uptime: string;
	readonly egress: readonly string[];
	readonly secrets: readonly string[];
	readonly kpis: readonly (readonly [string, string])[];
	readonly skills: readonly Skill[];
}

export interface Master {
	readonly accountId: string;
	readonly name: string;
}

export interface StoredAgentOn {
	readonly id: string;
	readonly on: boolean;
}

export interface StoredSkillOn {
	readonly id: string;
	readonly on: boolean;
}

export interface StoredAutonomy {
	readonly id: string;
	readonly autonomy: Autonomy;
}
