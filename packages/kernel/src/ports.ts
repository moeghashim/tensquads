// The five ports. Step 6 supplies every adapter except Decider.
// Decider stays without an adapter in version 1.

export interface AccountScope {
	readonly accountId: string;
	readonly mode: "account" | "platform";
}

export interface MachineProvider {
	host(agentId: string): string;
	region(agentId: string): string;
	size(agentId: string): string;
	cpu(agentId: string): string;
	uptime(agentId: string): string;
	egress(agentId: string): readonly string[];
	secrets(agentId: string): readonly string[];
}

export interface BusEventRecord {
	readonly id: string;
	readonly writes: readonly string[];
	readonly set?: Readonly<Record<string, unknown>>;
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
	listAccounts(scope: AccountScope): Promise<readonly unknown[]>;
}

export interface Decider {
	decide(input: unknown): never;
}

export const DECIDER_MISSING = "Decider has no adapter in version 1.";
