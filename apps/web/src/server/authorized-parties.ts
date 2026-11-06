// Clerk accepts a session token only when its azp is one of these origins.
// Production adds its origin to this list. Customer domains stay out until then.
// The deployed Worker keeps this list. A local dev server may add its own port.
export const authorizedParties = ["https://tensquads.moe-678.workers.dev", "http://localhost:3000"] as const;

export function partiesWithLocalPort(parties: readonly string[], port: string | undefined): readonly string[] {
	if (port === undefined || !/^[1-9]\d{0,4}$/.test(port) || port === "3000") return parties;
	const parsed = Number(port);
	if (parsed > 65535) return parties;
	const origin = `http://localhost:${port}`;
	return parties.includes(origin) ? parties : [...parties, origin];
}

export function partiesForBuild(): readonly string[] {
	if (import.meta.env.DEV) return partiesWithLocalPort(authorizedParties, process.env.TS_E2E_PORT);
	return authorizedParties;
}
