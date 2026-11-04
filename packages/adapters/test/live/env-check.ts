const injectedBoat = [
	"AGENT_ID",
	"ASCII_API_URL",
	"ASCII_PORT",
	"ASCII_TOKEN",
	"BOAT_ID",
	"ENVIRONMENT_ID",
	"PRODUCT_MODE",
];

// OLDPWD, PWD, SHLVL, and _ are shell state. They change as commands run, so a fresh machine cannot name them.
const shellState = new Set(["OLDPWD", "PWD", "SHLVL", "_"]);

function machineEnvironment(stdout: string): Map<string, string> {
	const env = new Map<string, string>();
	for (const line of stdout.split("\n")) {
		const index = line.indexOf("=");
		if (index <= 0) continue;
		env.set(line.slice(0, index), line.slice(index + 1));
	}
	return env;
}

export function environmentNames(stdout: string): string[] {
	return [...machineEnvironment(stdout).keys()].sort();
}

export function assertMachineEnv(
	stdout: string,
	expected: Readonly<Record<string, string>>,
	secrets: readonly string[],
	baselineNames: readonly string[],
): void {
	const env = machineEnvironment(stdout);
	const baseline = new Set(baselineNames);
	for (const [key, value] of Object.entries(expected)) {
		if (env.get(key) !== value) throw new Error(`The machine env ${key} does not match the sent value.`);
	}
	for (const key of injectedBoat) {
		if (!env.get(key)) throw new Error(`${key} is missing.`);
	}
	if (env.has("TENSQUADS_TRIAL_KEY")) throw new Error("The secret name is present on the machine.");
	for (const secret of secrets) {
		if (secret.length < 12) continue;
		for (const value of env.values()) {
			if (value.includes(secret)) throw new Error("The machine env holds a boat API key.");
		}
	}
	const sent = new Set(Object.keys(expected));
	const extra = [...env.keys()]
		.filter((key) => !sent.has(key) && !injectedBoat.includes(key) && !baseline.has(key) && !shellState.has(key))
		.sort();
	if (extra.length > 0) throw new Error(`The machine env has an unexpected variable: ${extra.join(", ")}.`);
}

export function boatVariableNames(stdout: string): string[] {
	return [...machineEnvironment(stdout).keys()].filter((key) => injectedBoat.includes(key)).sort();
}
