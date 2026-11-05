import type { PublishedEvent } from "@tensquads/kernel";

export function isObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object") return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

export function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

export async function readAgentBody(
	request: Request,
): Promise<{ accountId: string; agentId: string; body: Record<string, unknown> } | null> {
	const body: unknown = await request.json().catch(() => null);
	if (!isObject(body) || !isNonEmptyString(body.accountId) || !isNonEmptyString(body.agentId)) return null;
	return { accountId: body.accountId, agentId: body.agentId, body };
}

export function isBusRecord(value: unknown): value is { accountId: string; event: PublishedEvent } {
	if (!isObject(value) || !isNonEmptyString(value.accountId) || !isObject(value.event)) return false;
	const event = value.event;
	return (
		["id", "from", "to", "kind", "skill", "text"].every((key) => isNonEmptyString(event[key])) &&
		isObject(event.payload) &&
		Array.isArray(event.writes) &&
		event.writes.every((key: unknown) => typeof key === "string") &&
		(event.set === undefined || isObject(event.set)) &&
		(event.time === undefined || typeof event.time === "string") &&
		(event.trace === undefined || typeof event.trace === "string")
	);
}
