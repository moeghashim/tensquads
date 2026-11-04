import type { ConversationRepository, Fenced, Rule, StoredLimit, WriteFence } from "@tensquads/domain";

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
	start(agentId: string): void;
	stop(agentId: string): void;
	makeTemplate(imageId: string): MachineTemplate;
	startFromTemplate(templateId: string, agentId: string): StartedMachine;
}

// The sync ports above stay for the screens. These async ports take an account
// so a real machine call cannot cross accounts. Callers of the sync ports are unchanged.
export type MachineFaultCode =
	| "rate_limited"
	| "limit_reached"
	| "billing_required"
	| "out_of_capacity"
	| "data_expired"
	| "stop_refused"
	| "save_failed"
	| "unavailable";

export class MachineFault extends Error {
	readonly code: MachineFaultCode;

	constructor(code: MachineFaultCode, message: string) {
		super(message);
		this.name = "MachineFault";
		this.code = code;
	}
}

export interface AccountMachine {
	host(scope: AccountScope, agentId: string): Promise<string>;
	region(scope: AccountScope, agentId: string): Promise<string>;
	size(scope: AccountScope, agentId: string): Promise<string>;
	cpu(scope: AccountScope, agentId: string): Promise<string>;
	uptime(scope: AccountScope, agentId: string): Promise<string>;
	egress(scope: AccountScope, agentId: string): Promise<readonly string[]>;
	secrets(scope: AccountScope, agentId: string): Promise<readonly string[]>;
	start(scope: AccountScope, agentId: string, imageTag: string): Promise<void>;
	stop(scope: AccountScope, agentId: string): Promise<void>;
	resume(scope: AccountScope, agentId: string): Promise<void>;
	remove(scope: AccountScope, agentId: string): Promise<void>;
	registerSecret(scope: AccountScope, name: string): Promise<void>;
	removeSecret(scope: AccountScope, name: string): Promise<void>;
	makeTemplate(scope: AccountScope, imageId: string, version: string): Promise<MachineTemplate>;
	startFromTemplate(scope: AccountScope, templateId: string, agentId: string): Promise<StartedMachine>;
	removeTemplate(scope: AccountScope, templateId: string): Promise<void>;
}

export interface PublishedEvent {
	readonly id: string;
	readonly from: string;
	readonly to: string;
	readonly kind: string;
	readonly skill: string;
	readonly text: string;
	readonly payload: Readonly<Record<string, unknown>>;
	readonly writes: readonly string[];
	readonly set?: Readonly<Record<string, unknown>>;
	readonly time?: string;
	readonly trace?: string;
}

export interface AccountEventBus {
	events(scope: AccountScope): Promise<readonly PublishedEvent[]>;
	nextEvent(scope: AccountScope): Promise<PublishedEvent | undefined>;
	store(scope: AccountScope): Promise<Readonly<Record<string, unknown>>>;
	publish(scope: AccountScope, event: PublishedEvent): Promise<void>;
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
		setRuleOn(
			scope: AccountScope,
			id: string,
			on: boolean,
			fence: WriteFence,
			deadlineAt?: number,
		): Promise<Fenced<Rule>>;
		addRule(
			scope: AccountScope,
			draft: { readonly when: string; readonly agent: string; readonly action: string; readonly approval: string },
			deadlineAt?: number,
		): Promise<Rule | null>;
		setLimit(
			scope: AccountScope,
			key: string,
			value: number,
			fence: WriteFence,
			deadlineAt?: number,
		): Promise<Fenced<StoredLimit>>;
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
