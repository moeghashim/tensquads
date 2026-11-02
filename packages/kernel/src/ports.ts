import type { ConversationRepository } from "@tensquads/domain";

// The five ports. Step 6 supplies every adapter except Decider.
// Decider stays without an adapter in version 1.

export interface AccountScope {
	readonly accountId: string;
	readonly mode: "account" | "platform";
}

export interface MachineTemplate {
	readonly id: string;
}

export interface StartedMachine {
	readonly templateId: string;
	readonly agentId: string;
}

export interface MachineProvider {
	host(agentId: string): string;
	region(agentId: string): string;
	size(agentId: string): string;
	cpu(agentId: string): string;
	uptime(agentId: string): string;
	egress(agentId: string): readonly string[];
	secrets(agentId: string): readonly string[];
	makeTemplate(imageId: string): MachineTemplate;
	startFromTemplate(templateId: string, agentId: string): StartedMachine;
}

export interface BusEventRecord {
	readonly id: string;
	readonly writes: readonly string[];
	readonly set?: Readonly<Record<string, unknown>>;
	readonly time?: string;
	readonly trace?: string;
}

export interface EventBus {
	events(): readonly BusEventRecord[];
	nextEvent(): BusEventRecord | undefined;
}

export interface IntegrationGateway {
	read(key: string): unknown;
	write(key: string, value: unknown): unknown;
}

export interface Repositories {
	readonly platform: {
		listAccounts(scope: AccountScope): Promise<readonly unknown[]>;
		totals(scope: AccountScope): Promise<unknown>;
	};
	readonly squads: {
		listAgents(scope: AccountScope): Promise<readonly unknown[]>;
		tasksDone(scope: AccountScope): Promise<number>;
	};
	readonly bus: {
		listEvents(scope: AccountScope): Promise<readonly unknown[]>;
	};
	readonly policy: {
		inbox(scope: AccountScope): Promise<unknown>;
		setRuleOn(scope: AccountScope, id: string, on: boolean): Promise<void>;
		addRule(
			scope: AccountScope,
			draft: { readonly when: string; readonly agent: string; readonly action: string; readonly approval: string },
		): Promise<string | null>;
		setLimit(scope: AccountScope, key: string, value: number): Promise<void>;
	};
	readonly catalog: {
		listImages(scope: AccountScope): Promise<readonly unknown[]>;
	};
	readonly conversation: ConversationRepository;
}

export interface Decision {
	readonly answer: string;
	readonly confidence: number;
}

export interface Decider {
	decide(question: string, answers: readonly string[]): Decision;
}

export const DECIDER_MISSING = "Decider has no adapter in version 1.";
