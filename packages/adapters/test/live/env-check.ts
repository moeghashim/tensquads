const boatKey = /^(BOAT_|ASCII_)/;
const namedBoat = new Set(["AGENT_ID", "ENVIRONMENT_ID", "PRODUCT_MODE", "SERVICE_PREVIEW_TOKEN"]);

export function machineEnvironment(stdout: string): Map<string, string> {
	const env = new Map<string, string>();
	for (const line of stdout.split("\n")) {
		const index = line.indexOf("=");
		if (index <= 0) continue;
		env.set(line.slice(0, index), line.slice(index + 1));
	}
	return env;
}

export function assertMachineEnv(
	stdout: string,
	expected: Readonly<Record<string, string>>,
	secrets: readonly string[],
): void {
	const env = machineEnvironment(stdout);
	for (const [key, value] of Object.entries(expected)) {
		if (env.get(key) !== value) throw new Error(`The machine env ${key} does not match the sent value.`);
	}
	if (!env.get("BOAT_ID")) throw new Error("BOAT_ID is missing.");
	if (!env.get("ASCII_TOKEN")) throw new Error("ASCII_TOKEN is missing.");
	if (env.has("TENSQUADS_TRIAL_KEY")) throw new Error("The secret name is present on the machine.");
	for (const secret of secrets) {
		if (secret.length < 12) continue;
		for (const value of env.values()) {
			if (value.includes(secret)) throw new Error("The machine env holds a boat API key.");
		}
	}
}

export function boatVariableNames(stdout: string): string[] {
	return [...machineEnvironment(stdout).keys()].filter((key) => boatKey.test(key) || namedBoat.has(key)).sort();
}
