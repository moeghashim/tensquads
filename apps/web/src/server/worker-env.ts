export async function workerEnv(name: string): Promise<string> {
	const fromProcess = process.env[name];
	if (hasValue(fromProcess)) {
		return fromProcess;
	}
	try {
		const workers = await import("cloudflare:workers");
		const env = workers.env as unknown as Record<string, unknown> | undefined;
		const value = env?.[name];
		return stringValue(value);
	} catch {
		return "";
	}
}

function hasValue(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function stringValue(value: unknown) {
	return typeof value === "string" ? value : "";
}
