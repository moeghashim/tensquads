import { type BusEvent, planNextEvent, type TrafficCursor } from "@tensquads/domain";
import type { EventBus } from "@tensquads/kernel";

import { traceFor } from "./trace.ts";

export interface ScriptedBusEvent {
	readonly from: string;
	readonly to: string;
	readonly kind: BusEvent["kind"];
	readonly skill: string;
	readonly text: string;
	readonly payload: Readonly<Record<string, unknown>>;
	readonly writes: readonly string[];
	readonly set?: Readonly<Record<string, unknown>>;
}

export interface MemoryBus extends EventBus {
	store(): Readonly<Record<string, unknown>>;
	cursor(): TrafficCursor;
	nextEvent(): BusEvent | undefined;
}

const openedCursor: TrafficCursor = { seq: 100, clock: 11 * 60 + 2, scriptIndex: 0 };

function startCursor(cursor: TrafficCursor | undefined): TrafficCursor {
	return {
		seq: cursor?.seq ?? openedCursor.seq,
		clock: cursor?.clock ?? openedCursor.clock,
		scriptIndex: cursor?.scriptIndex ?? openedCursor.scriptIndex,
	};
}

// Holds the design events. nextEvent appends the next scripted event.
// Main.dc.html:1095 applies `set`, which is the value for each key named in `writes`.
// The initial store is already the result of the seeded writes, so those writes are not applied again.
// Main.dc.html:959 starts seq at 100. Main.dc.html:1051 starts the clock at 11:02, and now() adds one minute.
export function createMemoryBus(input: {
	readonly events: readonly BusEvent[];
	readonly script: readonly ScriptedBusEvent[];
	readonly store: Readonly<Record<string, unknown>>;
	readonly trace?: (id: string) => string;
	readonly cursor?: TrafficCursor;
}): MemoryBus {
	const events = [...input.events];
	const store: Record<string, unknown> = { ...input.store };
	let cursor = startCursor(input.cursor);
	const trace = input.trace ?? traceFor;

	return {
		events: () => events,
		store: () => store,
		cursor: () => cursor,
		nextEvent() {
			const plan = planNextEvent(events, input.script, cursor, trace);
			if (!plan) return undefined;
			if (plan.event.set) Object.assign(store, plan.event.set);
			events.push(plan.event);
			cursor = plan.cursor;
			return plan.event;
		},
	};
}
