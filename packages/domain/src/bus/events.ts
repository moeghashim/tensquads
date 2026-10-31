import type { BusEvent } from "./types.ts";

export interface BusAppended {
	readonly type: "bus.appended";
	readonly event: BusEvent;
}

export type BusDomainEvent = BusAppended;
