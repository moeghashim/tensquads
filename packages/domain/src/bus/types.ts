export type BusKind = "Task" | "Result" | "Request" | "Relay" | "Escalation" | "Approval" | "Declined";

export interface BusEvent {
	readonly id: string;
	readonly time: string;
	readonly from: string;
	readonly to: string;
	readonly kind: BusKind;
	readonly skill: string;
	readonly text: string;
	readonly payload: Readonly<Record<string, unknown>>;
	readonly writes: readonly string[];
	readonly trace: string;
	readonly set?: Readonly<Record<string, unknown>>;
}

export interface StateEntry {
	readonly key: string;
	readonly value: unknown;
}
