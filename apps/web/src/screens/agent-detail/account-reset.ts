const resets = new Set<() => void>();

export function onAgentAccountReset(reset: () => void): void {
	resets.add(reset);
}

export function resetAgentAccountState(): void {
	for (const reset of resets) reset();
}
