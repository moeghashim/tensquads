import { chooseAdapters } from "../adapter-choice.ts";

// The master records a monitor id against one account. The webhook reads this map.
// A query parameter is never the account.

const monitors = new Map<string, string>();
const DIRECTORY = "__monitors";

interface MonitorDirectory {
	idFromName(name: string): unknown;
	get(id: unknown): { fetch(input: Request | string | URL, init?: RequestInit): Promise<Response> };
}

interface MonitorEnv {
	readonly ADAPTERS?: string;
	readonly ACCOUNT_BUS?: MonitorDirectory;
}

function rejectMonitor(message: string): Error {
	return new Error(message);
}

function directory(env: MonitorEnv): MonitorDirectory | undefined {
	if (!env.ACCOUNT_BUS || chooseAdapters(env.ADAPTERS) !== "real") return undefined;
	return env.ACCOUNT_BUS;
}

async function writeDirectory(env: MonitorEnv, monitorId: string, accountId: string): Promise<void> {
	const namespace = directory(env);
	if (!namespace) return;
	const response = await namespace.get(namespace.idFromName(DIRECTORY)).fetch("https://bus/monitor", {
		method: "POST",
		body: JSON.stringify({ monitorId, accountId }),
	});
	if (!response.ok) throw rejectMonitor("The monitor belongs to another account.");
}

async function readDirectory(env: MonitorEnv, monitorId: string): Promise<string | null> {
	const namespace = directory(env);
	if (!namespace) return null;
	const response = await namespace
		.get(namespace.idFromName(DIRECTORY))
		.fetch(`https://bus/monitor?id=${encodeURIComponent(monitorId)}`);
	if (!response.ok) return null;
	const body = (await response.json()) as { accountId?: unknown };
	return typeof body.accountId === "string" && body.accountId.length > 0 ? body.accountId : null;
}

export async function recordMonitor(monitorId: string, accountId: string, env?: MonitorEnv): Promise<void> {
	if (monitorId.length === 0 || accountId.length === 0) throw rejectMonitor("The monitor was rejected.");
	const current = monitors.get(monitorId);
	if (current !== undefined && current !== accountId) throw rejectMonitor("The monitor belongs to another account.");
	if (env) await writeDirectory(env, monitorId, accountId);
	monitors.set(monitorId, accountId);
}

export async function resolveMonitor(monitorId: string, env?: MonitorEnv): Promise<string | null> {
	if (monitorId.length === 0) return null;
	if (env && directory(env)) return readDirectory(env, monitorId);
	return monitors.get(monitorId) ?? null;
}
