import type { PublishedEvent } from "@tensquads/kernel";

import { chooseAdapters } from "../adapter-choice.ts";
import type { BusObjectEnv, BusStorage } from "./account-bus.ts";
import { BUS_ALARM, setDeadline } from "./alarm.ts";

export const MASTER_OPEN = "master-open:";
export const MASTER_DONE = "master-done:";
export const MASTER_PHASE = "master-phase";
const RETRY_MS = 1000;

export function masterEvent(event: { readonly kind: string; readonly to: string; readonly from: string }): boolean {
	if (event.to !== "master") return false;
	if (event.kind === "Result") return true;
	return event.kind === "Approval" && event.from === "user";
}

async function rememberRetry(storage: BusStorage): Promise<void> {
	const retryAt = Date.now() + RETRY_MS;
	const busDue = await storage.get<number>(BUS_ALARM);
	const due = typeof busDue === "number" && busDue > Date.now() ? Math.min(busDue, retryAt) : retryAt;
	await setDeadline(storage, BUS_ALARM, due);
}

export async function finishMaster(
	storage: BusStorage,
	env: BusObjectEnv,
	event: PublishedEvent,
	receipt: boolean,
	run: (event: PublishedEvent) => Promise<void>,
): Promise<void> {
	if (!masterEvent(event) || chooseAdapters(env.ADAPTERS) !== "real") return;
	if (await storage.get(`${MASTER_DONE}${event.id}`)) return;
	const openKey = `${MASTER_OPEN}${event.id}`;
	// The accept transaction stores this marker. A put here would sit outside that transaction.
	if (!receipt && !(await storage.get(openKey))) return;
	if (!(await storage.get(openKey))) return;
	try {
		await run(event);
	} catch (error) {
		await rememberRetry(storage);
		throw error;
	}
}

export async function retryOpenMaster(
	storage: BusStorage,
	env: BusObjectEnv,
	run: (accountId: string, event: PublishedEvent) => Promise<void>,
): Promise<void> {
	if (chooseAdapters(env.ADAPTERS) !== "real") return;
	const accountId = await storage.get<string>("account");
	if (!accountId) return;
	const open = await storage.list<PublishedEvent>({ prefix: MASTER_OPEN });
	for (const [key, event] of open) {
		if (await storage.get(`${MASTER_DONE}${event.id}`)) {
			await storage.delete(key);
			continue;
		}
		await finishMaster(storage, env, event, true, (item) => run(accountId, item));
	}
}
