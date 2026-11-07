import type { BusinessRequest } from "@tensquads/domain/master";

import type { ScriptedBusEvent } from "../memory-bus.ts";
import { isNonEmptyString, isObject } from "./message.ts";

export const BUSINESS_KEY = "state:business";

function scriptStep(step: unknown): ScriptedBusEvent | undefined {
	if (!isObject(step)) return undefined;
	const from = step.from;
	const to = step.to;
	const kind = step.kind;
	const skill = step.skill;
	const text = step.text;
	const payload = step.payload;
	if (!isNonEmptyString(from) || !isNonEmptyString(to) || !isNonEmptyString(kind)) return undefined;
	if (!isNonEmptyString(skill) || !isNonEmptyString(text) || !isObject(payload)) return undefined;
	const writes = step.writes === undefined ? [] : step.writes;
	if (!Array.isArray(writes) || writes.some((key) => typeof key !== "string")) return undefined;
	if (step.set !== undefined && !isObject(step.set)) return undefined;
	return {
		from,
		to,
		kind: kind as ScriptedBusEvent["kind"],
		skill,
		text,
		payload,
		writes: writes as string[],
		set: isObject(step.set) ? step.set : undefined,
	};
}

export function advanceBody(
	body: unknown,
): { accountId: string; script: ScriptedBusEvent[]; deadlineAt?: number } | undefined {
	if (!isObject(body) || !isNonEmptyString(body.accountId) || !Array.isArray(body.script)) return undefined;
	const script: ScriptedBusEvent[] = [];
	for (const step of body.script) {
		const parsed = scriptStep(step);
		if (!parsed) return undefined;
		script.push(parsed);
	}
	const deadlineAt =
		typeof body.deadlineAt === "number" && Number.isFinite(body.deadlineAt) ? body.deadlineAt : undefined;
	return { accountId: body.accountId, script, deadlineAt };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readItem(value: unknown): BusinessRequest["items"][number] | null {
	if (!isRecord(value)) return null;
	if (typeof value.name !== "string" || typeof value.price !== "string" || typeof value.section !== "string") {
		return null;
	}
	return { name: value.name, price: value.price, section: value.section };
}

function readSections(value: unknown): readonly string[] | undefined | null {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) return null;
	if (value.some((item) => typeof item !== "string" || item.length === 0)) return null;
	return value as string[];
}

// One bad item rejects the whole list.
function readItems(value: unknown): BusinessRequest["items"][number][] | null {
	if (!Array.isArray(value)) return null;
	const items = [];
	for (const entry of value) {
		const item = readItem(entry);
		if (!item) return null;
		items.push(item);
	}
	return items;
}

// A text field that is missing or blank is left out of the request.
function optionalText(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function parseStoredRequest(value: unknown): BusinessRequest | null {
	if (!isRecord(value)) return null;
	if (typeof value.businessName !== "string" || value.businessName.trim().length === 0) return null;
	if (value.businessType !== "restaurant" && value.businessType !== "grocer") return null;
	const items = readItems(value.items);
	if (!items) return null;
	const sections = readSections(value.sections);
	if (sections === null) return null;
	const cuisine = optionalText(value.cuisine);
	const location = optionalText(value.location);
	return {
		businessName: value.businessName,
		businessType: value.businessType,
		items,
		...(cuisine ? { cuisine } : {}),
		...(location ? { location } : {}),
		...(sections ? { sections } : {}),
	};
}
