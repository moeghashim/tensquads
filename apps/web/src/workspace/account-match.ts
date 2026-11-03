export interface AccountMatch {
	readonly routeId: string;
	readonly loaderData?: unknown;
}

const layoutId = "/_workspace";

function accountIdOf(data: unknown): string | null {
	if (typeof data !== "object" || data === null || !("accountId" in data)) return null;
	const accountId = data.accountId;
	if (typeof accountId !== "string" || accountId.length === 0) return null;
	return accountId;
}

// The leaf workspace read. A layout match is not a screen.
export function workspaceChildAccount(matches: readonly AccountMatch[]): string | null {
	const child = [...matches].reverse().find((match) => match.routeId.startsWith(`${layoutId}/`));
	if (!child) return null;
	return accountIdOf(child.loaderData);
}

// One reread for this signed-in user and frame account. A match clears the key.
export function nextReread(
	userId: string | null,
	frameAccountId: string,
	childAccountId: string | null,
	tried: string | null,
): string | null {
	if (childAccountId === null || childAccountId === frameAccountId) return null;
	const key = `${userId ?? ""}:${frameAccountId}`;
	return tried === key ? null : key;
}
