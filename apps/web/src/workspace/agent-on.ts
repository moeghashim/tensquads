type AgentOn = { readonly id: string; readonly on: boolean };

const listeners = new Set<() => void>();
let published: ReadonlyMap<string, boolean> = new Map();

export function publishAgentOn(id: string, on: boolean): void {
	if (published.get(id) === on) return;
	const next = new Map(published);
	next.set(id, on);
	published = next;
	for (const listener of listeners) listener();
}

export function subscribeAgentOn(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function agentOnSnapshot(): ReadonlyMap<string, boolean> {
	return published;
}

export function applyAgentOn<T extends AgentOn>(
	agents: readonly T[],
	onById: ReadonlyMap<string, boolean>,
): readonly T[] {
	if (onById.size === 0) return agents;
	let changed = false;
	const next = agents.map((agent) => {
		const on = onById.get(agent.id);
		if (on === undefined || on === agent.on) return agent;
		changed = true;
		return { ...agent, on };
	});
	return changed ? next : agents;
}
