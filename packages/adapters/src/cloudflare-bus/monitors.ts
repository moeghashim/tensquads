import { and, eq, sql } from "drizzle-orm";

import { chooseAdapters } from "../adapter-choice.ts";
import { takeWriterLock } from "../neon/lock.ts";
import { agents, monitorSecrets } from "../neon/schema.ts";
import { withNeon } from "./neon-write.ts";

// The master records a monitor id against one account. The researcher records its secret.
// A query parameter is never the account.

const monitors = new Map<string, string>();
const secrets = new Map<string, { readonly accountId: string; readonly secret: string }>();
const DIRECTORY = "__monitors";
const RESEARCHER_ID = "market";
const RESEARCHER_ROLE = "Market researcher";

interface MonitorDirectory {
	idFromName(name: string): unknown;
	get(id: unknown): { fetch(input: Request | string | URL, init?: RequestInit): Promise<Response> };
}

export interface MonitorEnv {
	readonly ADAPTERS?: string;
	readonly ACCOUNT_BUS?: MonitorDirectory;
	readonly DATABASE_URL?: string;
}

export interface StoredMonitorSecret {
	readonly accountId: string;
	readonly secret: string;
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

function isResearcher(id: string, role: string): boolean {
	return id === RESEARCHER_ID && role === RESEARCHER_ROLE;
}

async function storeDatabaseSecret(
	connectionString: string,
	accountId: string,
	agentId: string,
	monitorId: string,
	secret: string,
): Promise<boolean> {
	return withNeon(connectionString, async (db) => {
		return db.transaction(async (tx) => {
			await takeWriterLock((statement) => tx.execute(sql.raw(statement)), accountId);
			const agentRows = await tx
				.select({ id: agents.id, role: agents.role })
				.from(agents)
				.where(and(eq(agents.accountId, accountId), eq(agents.id, agentId)));
			const agent = agentRows[0];
			if (!agent || !isResearcher(agent.id, agent.role)) return false;
			const updated = await tx
				.insert(monitorSecrets)
				.values({ accountId, monitorId, secret })
				.onConflictDoUpdate({
					target: monitorSecrets.monitorId,
					set: { secret },
					setWhere: eq(monitorSecrets.accountId, accountId),
				})
				.returning({ monitorId: monitorSecrets.monitorId });
			return updated.length === 1;
		});
	});
}

async function readDatabaseSecret(connectionString: string, monitorId: string): Promise<StoredMonitorSecret | null> {
	return withNeon(connectionString, async (db) => {
		const rows = await db
			.select({ accountId: monitorSecrets.accountId, secret: monitorSecrets.secret })
			.from(monitorSecrets)
			.where(eq(monitorSecrets.monitorId, monitorId));
		const row = rows[0];
		if (!row || row.accountId.length === 0 || row.secret.length === 0) return null;
		return { accountId: row.accountId, secret: row.secret };
	});
}

function storeMemorySecret(accountId: string, monitorId: string, secret: string): boolean {
	const existingMonitor = monitors.get(monitorId);
	if (existingMonitor !== undefined && existingMonitor !== accountId) return false;
	const existingSecret = secrets.get(monitorId);
	if (existingSecret !== undefined && existingSecret.accountId !== accountId) return false;
	monitors.set(monitorId, accountId);
	secrets.set(monitorId, { accountId, secret });
	return true;
}

export async function recordMonitorSecret(
	env: MonitorEnv,
	accountId: string,
	agentId: string,
	monitorId: string,
	secret: string,
): Promise<boolean> {
	if (accountId.length === 0 || agentId.length === 0 || monitorId.length === 0 || secret.length === 0) return false;
	if (env.DATABASE_URL) {
		try {
			const saved = await storeDatabaseSecret(env.DATABASE_URL, accountId, agentId, monitorId, secret);
			if (!saved) return false;
		} catch {
			return false;
		}
		storeMemorySecret(accountId, monitorId, secret);
		return true;
	}
	if (agentId !== RESEARCHER_ID) return false;
	return storeMemorySecret(accountId, monitorId, secret);
}

export async function resolveMonitorSecret(monitorId: string, env?: MonitorEnv): Promise<StoredMonitorSecret | null> {
	if (monitorId.length === 0) return null;
	if (env?.DATABASE_URL) {
		try {
			return await readDatabaseSecret(env.DATABASE_URL, monitorId);
		} catch {
			return null;
		}
	}
	return secrets.get(monitorId) ?? null;
}

export async function recordMonitor(monitorId: string, accountId: string, env?: MonitorEnv): Promise<void> {
	if (monitorId.length === 0 || accountId.length === 0) throw rejectMonitor("The monitor was rejected.");
	const current = monitors.get(monitorId);
	if (current !== undefined && current !== accountId) throw rejectMonitor("The monitor belongs to another account.");
	const existingSecret = secrets.get(monitorId);
	if (existingSecret !== undefined && existingSecret.accountId !== accountId) {
		throw rejectMonitor("The monitor belongs to another account.");
	}
	if (env) await writeDirectory(env, monitorId, accountId);
	monitors.set(monitorId, accountId);
}

export async function resolveMonitor(monitorId: string, env?: MonitorEnv): Promise<string | null> {
	if (monitorId.length === 0) return null;
	if (env && directory(env)) return readDirectory(env, monitorId);
	return monitors.get(monitorId) ?? secrets.get(monitorId)?.accountId ?? null;
}
