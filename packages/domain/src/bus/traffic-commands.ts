import type { AccountScope } from "../scope.ts";
import type { BusEvent, BusKind } from "./types.ts";

export type NextEventCommand = (scope: AccountScope) => Promise<void>;

export interface TrafficCursor {
	readonly seq: number;
	readonly clock: number;
	readonly scriptIndex: number;
}

export interface TrafficScriptStep {
	readonly from: string;
	readonly to: string;
	readonly kind: string;
	readonly skill: string;
	readonly text: string;
	readonly payload: Readonly<Record<string, unknown>>;
	readonly writes?: readonly string[];
	readonly set?: Readonly<Record<string, unknown>>;
}

export interface PlannedTrafficEvent {
	readonly event: BusEvent;
	readonly cursor: TrafficCursor;
}

const busKinds = ["Task", "Result", "Request", "Relay", "Escalation", "Approval", "Declined"] as const;

export function knownKind(kind: string): BusKind {
	for (const candidate of busKinds) {
		if (candidate === kind) return candidate;
	}
	throw new Error(`The script kind ${kind} is not a bus kind.`);
}

function clockText(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

// One step of the design script. A repeat id returns undefined and changes nothing.
export function planNextEvent(
	events: readonly { readonly id: string }[],
	script: readonly TrafficScriptStep[],
	cursor: TrafficCursor,
	trace: (id: string) => string,
): PlannedTrafficEvent | undefined {
	if (script.length === 0) return undefined;
	const id = `e${cursor.seq}`;
	if (events.some((event) => event.id === id)) return undefined;
	const scripted = script[cursor.scriptIndex % script.length];
	if (!scripted) return undefined;
	const clock = cursor.clock + 1;
	return {
		event: {
			id,
			time: clockText(clock),
			from: scripted.from,
			to: scripted.to,
			kind: knownKind(scripted.kind),
			skill: scripted.skill,
			text: scripted.text,
			payload: scripted.payload,
			writes: scripted.writes ?? [],
			trace: trace(id),
			set: scripted.set,
		},
		cursor: { seq: cursor.seq + 1, clock, scriptIndex: cursor.scriptIndex + 1 },
	};
}
