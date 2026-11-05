type AgentOn = { readonly id: string; readonly on: boolean };

const epochs = new Map<string, number>();
const listeners = new Set<() => void>();
const sessionListeners = new Set<() => void>();
const resets = new Set<() => void>();
let published: ReadonlyMap<string, boolean> = new Map();
let session = 0;

export function agentSession(): number {
	return session;
}

export function subscribeAgentSession(listener: () => void): () => void {
	sessionListeners.add(listener);
	return () => {
		sessionListeners.delete(listener);
	};
}

export function onAgentClientReset(reset: () => void): void {
	resets.add(reset);
}

export function resetAgentClientState(): void {
	session += 1;
	epochs.clear();
	published = new Map();
	for (const reset of resets) reset();
	for (const listener of listeners) listener();
	for (const listener of sessionListeners) listener();
}

export function stampAgentRead(agentId: string): number {
	return epochs.get(agentId) ?? 0;
}

export function stampAgentReads(): Readonly<Record<string, number>> {
	return Object.fromEntries(epochs);
}

export function noteAgentWrite(agentId: string): void {
	epochs.set(agentId, stampAgentRead(agentId) + 1);
}

export function clearPublishedAgentOn(): void {
	if (published.size === 0) return;
	published = new Map();
	for (const listener of listeners) listener();
}

export function publishAgentOn(id: string, on: boolean): void {
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
	readAt: Readonly<Record<string, number>>,
): readonly T[] {
	if (onById.size === 0) return agents;
	let changed = false;
	const next = agents.map((agent) => {
		if ((readAt[agent.id] ?? 0) === stampAgentRead(agent.id)) return agent;
		const on = onById.get(agent.id);
		if (on === undefined || on === agent.on) return agent;
		changed = true;
		return { ...agent, on };
	});
	return changed ? next : agents;
}
