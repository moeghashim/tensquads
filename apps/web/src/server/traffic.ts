import { createServerFn } from "@tanstack/react-start";

import type { Json, JsonObject, TrafficData } from "#/screens/traffic/view.ts";

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
			events: orderEventPayloads(events).map((event) => ({ ...event, payload: jsonObject(event.payload) })),
			store: Object.entries(store).map(([key, value]) => ({ key, value: jsonValue(value) })),
			agents: agents.map((agent) => ({
				id: agent.id,
				name: agent.name,
				host: agent.host,
				tint: agent.tint,
				on: agent.on,
			})),
			masterName: master?.name ?? "Master",
		};
	});
});

export const advanceTraffic = createServerFn({ method: "POST" }).handler(async (): Promise<string> => {
	const { requireWorkspace } = await import("./workspace-session.ts");
	return requireWorkspace(async (scope, db) => {
		const { createRepositories } = await import("@tensquads/adapters");
		const { Kernel } = await import("@tensquads/kernel");
		const repositories = createRepositories(db);
		const before = new Set((await repositories.bus.listEvents(scope)).map((event) => event.id));
		await new Kernel(repositories).nextEvent(scope);
		const after = await repositories.bus.listEvents(scope);
		return after.filter((event) => !before.has(event.id)).at(-1)?.id ?? "";
	});
});
