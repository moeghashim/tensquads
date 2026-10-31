import type { BusEvent, BusKind } from "@tensquads/domain";
import type { EventBus } from "@tensquads/kernel";

import { traceFor } from "./trace.ts";

export interface ScriptedBusEvent {
	readonly from: string;
	readonly to: string;
	readonly kind: BusKind;
	readonly skill: string;
	readonly text: string;
	readonly payload: Readonly<Record<string, unknown>>;
	readonly writes: readonly string[];
	readonly set?: Readonly<Record<string, unknown>>;
}

export interface MemoryBus extends EventBus {
	store(): Readonly<Record<string, unknown>>;
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
}): MemoryBus {
	const events = [...input.events];
	const store: Record<string, unknown> = { ...input.store };
	let index = 0;
	let seq = 100;
	let clock = 11 * 60 + 2;
	const trace = input.trace ?? traceFor;

	return {
		events: () => events,
		store: () => store,
		nextEvent() {
			if (input.script.length === 0) {
				return undefined;
			}
			const scripted = input.script[index % input.script.length];
			if (!scripted) {
				return undefined;
			}
			index += 1;
			clock += 1;
			const id = `e${seq}`;
			seq += 1;
			const time = `${String(Math.floor(clock / 60)).padStart(2, "0")}:${String(clock % 60).padStart(2, "0")}`;
			if (scripted.set) {
				Object.assign(store, scripted.set);
			}
			const event: BusEvent = {
				id,
				time,
				from: scripted.from,
				to: scripted.to,
				kind: scripted.kind,
				skill: scripted.skill,
				text: scripted.text,
				payload: scripted.payload,
				writes: scripted.writes,
				trace: trace(id),
				set: scripted.set,
			};
			events.push(event);
			return event;
		},
	};
}
