export type ImageStatus = "Stable" | "Needs attention" | "Beta" | "Draft";

export type Severity = "High" | "Medium" | "Low";

export type FeatureStage = "Backlog" | "Planned" | "In review" | "In progress";

export interface Bug {
	readonly id: string;
	readonly sev: Severity;
	readonly title: string;
	readonly age: string;
	readonly reports: number;
}

export interface FeatureRequest {
	readonly id: string;
	readonly title: string;
	readonly votes: number;
	readonly stage: FeatureStage;
}

export interface AgentImage {
	readonly id: string;
	readonly name: string;
	readonly role: string;
	readonly tint: string;
	readonly tag: string;
	readonly version: string;
	readonly nextVersion: string;
	readonly updated: string;
	readonly updatedFull: string;
	readonly deployed: number;
	readonly onLatest: number;
	readonly status: ImageStatus;
	readonly bugs: readonly Bug[];
	readonly features: readonly FeatureRequest[];
}

export interface CatalogCounts {
	readonly images: number;
	readonly openBugs: number;
	readonly featuresRequested: number;
}
