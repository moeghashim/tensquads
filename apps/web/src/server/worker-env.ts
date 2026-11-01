export async function workerEnv(name: string): Promise<string> {
	const fromProcess = process.env[name];
	if (typeof fromProcess === "string" && fromProcess.length > 0) {
		return fromProcess;
	}
	try {
		const workers = await import("cloudflare:workers");
		const env = workers.env as unknown as Record<string, unknown> | undefined;
		const value = env?.[name];
		return typeof value === "string" ? value : "";
	} catch {
		return "";
	}
}
