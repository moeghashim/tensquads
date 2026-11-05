import type { BusKind } from "@tensquads/domain";
import designFile from "../../seed/src/design.json" with { type: "json" };

import type { ScriptedBusEvent } from "./memory-bus.ts";

interface DesignStep {
	readonly from: string;
	readonly to: string;
	readonly kind: string;
	readonly skill: string;
	readonly text: string;
	readonly payload: Readonly<Record<string, unknown>>;
	readonly writes?: readonly string[];
	readonly set?: Readonly<Record<string, unknown>>;
}

const busKinds = ["Task", "Result", "Request", "Relay", "Escalation", "Approval", "Declined"] as const;

function knownKind(kind: string): BusKind {
	for (const candidate of busKinds) {
		if (candidate === kind) return candidate;
	}
	throw new Error(`The script kind ${kind} is not a bus kind.`);
}

// The same design script the Neon traffic command steps through.
export function trafficScript(): readonly ScriptedBusEvent[] {
	const steps = designFile.script as unknown as readonly DesignStep[];
	return steps.map((step) => ({
		from: step.from,
		to: step.to,
		kind: knownKind(step.kind),
		skill: step.skill,
		text: step.text,
		payload: step.payload,
		writes: step.writes ?? [],
		set: step.set,
	}));
}
