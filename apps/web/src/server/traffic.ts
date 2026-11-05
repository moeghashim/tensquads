import { createServerFn } from "@tanstack/react-start";

import type { Json, JsonObject, TrafficData, TrafficEvent } from "#/screens/traffic/view.ts";

function jsonValue(value: unknown): Json {
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
		return value;
	}
	if (Array.isArray(value)) return value.map((item) => jsonValue(item));
	if (typeof value === "object") {
		const result: { [key: string]: Json } = {};
		for (const [key, item] of Object.entries(value)) {
			if (item !== undefined) result[key] = jsonValue(item);
		}
		return result;
	}
	return null;
}

function jsonObject(value: unknown): JsonObject {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
	const result: { [key: string]: Json } = {};
	for (const [key, item] of Object.entries(value)) {
		if (item !== undefined) result[key] = jsonValue(item);
	}
	return result;
}

export const loadTraffic = createServerFn({ method: "GET" }).handler(async (): Promise<TrafficData> => {
	const { requireWorkspace } = await import("./workspace-session.ts");
	const { orderEventPayloads } = await import("./traffic-order.ts");
	return requireWorkspace(async (scope, db) => {
		const { createRepositories } = await import("@tensquads/adapters");
		const repositories = createRepositories(db);
		const [events, store, agents, master] = await Promise.all([
			repositories.bus.listEvents(scope),
			repositories.bus.readStore(scope),
			repositories.squads.listAgents(scope),
			repositories.squads.master(scope),
		]);
		return {
			accountId: scope.accountId,
			events: orderEventPayloads(events).map((event) => ({ ...event, payload: jsonObject(event.payload) })),
			store: Object.entries(store).map(([key, value]) => ({ key, value: jsonValue(value) })),
			agents: agents.map((agent) => ({
				id: agent.id,
				name: agent.name,
				host: agent.host,
				tint: agent.tint,
				on: agent.on,
			})),
			masterName: master?.name ?? "Petra",
		};
	});
});

export const advanceTraffic = createServerFn({ method: "POST" })
	.validator((input: unknown): string => {
		if (typeof input !== "string" || input.length === 0) throw new Error("The workspace write did not finish.");
		return input;
	})
	.handler(async ({ data }): Promise<TrafficEvent | null> => {
		const startedAt = Date.now();
		const { requireWorkspace } = await import("./workspace-session.ts");
		return requireWorkspace(
			async (scope, db) => {
				const { advanceTrafficAccount } = await import("./traffic-step.ts");
				const { orderEventPayloads } = await import("./traffic-order.ts");
				const created = await advanceTrafficAccount(db, scope, startedAt);
				if (!created) return null;
				const [ordered] = orderEventPayloads([created]);
				return trafficEvent(ordered ?? created);
			},
			{ accountId: data, startedAt },
		);
	});

function trafficEvent(event: {
	readonly id: string;
	readonly time: string;
	readonly from: string;
	readonly to: string;
	readonly kind: string;
	readonly skill: string;
	readonly text: string;
	readonly payload: unknown;
	readonly writes: readonly string[];
	readonly trace: string;
}): TrafficEvent {
	return {
		id: event.id,
		time: event.time,
		from: event.from,
		to: event.to,
		kind: event.kind,
		skill: event.skill,
		text: event.text,
		payload: jsonObject(event.payload),
		writes: event.writes,
		trace: event.trace,
	};
}
