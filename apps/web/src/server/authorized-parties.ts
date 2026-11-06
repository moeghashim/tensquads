// Clerk accepts a session token only when its azp is one of these origins.
// The deployed Worker accepts only its own origin. Customer domains stay out.
// A dev build also accepts http://localhost on TS_E2E_PORT, or on port 3000.
export const authorizedParties = ["https://tensquads.moe-678.workers.dev"] as const;

const localPortPattern = /^[1-9]\d{0,4}$/;

function localOrigin(port: string | undefined): string {
	if (port !== undefined && localPortPattern.test(port) && Number(port) <= 65535) {
		return `http://localhost:${port}`;
	}
	return "http://localhost:3000";
}

// Drop any local origin, then add the one origin for this dev server.
export function partiesWithLocalPort(parties: readonly string[], port: string | undefined): readonly string[] {
	const origin = localOrigin(port);
	const kept = parties.filter((party) => !party.startsWith("http://localhost:"));
	return [...kept, origin];
}

export function partiesForBuild(): readonly string[] {
	if (import.meta.env.DEV) return partiesWithLocalPort(authorizedParties, process.env.TS_E2E_PORT);
	return authorizedParties;
}
