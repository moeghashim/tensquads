import designFile from "../../../../packages/seed/src/design.json" with { type: "json" };

interface PayloadEvent {
	readonly id?: string;
	readonly payload?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (!isRecord(value)) return value;
	const result: Record<string, unknown> = {};
	for (const key of Object.keys(value).sort()) result[key] = canonicalize(value[key]);
	return result;
}

function stable(value: unknown): string {
	return JSON.stringify(canonicalize(value));
}

// jsonb does not keep the design's key order. The inspector string uses that order.
function reorderValue(stored: unknown, template: unknown): unknown {
	if (Array.isArray(stored) && Array.isArray(template)) {
		return stored.map((item, index) => reorderValue(item, template[index]));
	}
	if (!isRecord(stored) || !isRecord(template)) return stored;
	const result: Record<string, unknown> = {};
	for (const key of Object.keys(template)) {
		if (Object.hasOwn(stored, key)) result[key] = reorderValue(stored[key], template[key]);
	}
	for (const key of Object.keys(stored)) {
		if (!Object.hasOwn(result, key)) result[key] = stored[key];
	}
	return result;
}

function seedTemplates(): Map<string, unknown> {
	const seed = designFile.seed as { bus?: readonly PayloadEvent[] };
	const templates = new Map<string, unknown>();
	for (const event of seed.bus ?? []) {
		if (event.id && event.payload !== undefined) templates.set(event.id, event.payload);
	}
	return templates;
}

function scriptTemplates(): Map<string, unknown> {
	const steps = designFile.script as readonly PayloadEvent[];
	const templates = new Map<string, unknown>();
	for (const step of steps) {
		if (step.payload === undefined) continue;
		const key = stable(step.payload);
		if (!templates.has(key)) templates.set(key, step.payload);
	}
	return templates;
}

const seeds = seedTemplates();
const scripts = scriptTemplates();

function orderedPayload(id: string, payload: unknown): unknown {
	const seed = seeds.get(id);
	if (seed !== undefined) return reorderValue(payload, seed);
	const script = scripts.get(stable(payload));
	if (script !== undefined) return reorderValue(payload, script);
	return payload;
}

export function orderEventPayloads<T extends { readonly id: string; readonly payload: unknown }>(
	events: readonly T[],
): T[] {
	return events.map((event) => {
		const payload = orderedPayload(event.id, event.payload);
		return { ...event, payload: isRecord(payload) ? payload : event.payload };
	});
}
