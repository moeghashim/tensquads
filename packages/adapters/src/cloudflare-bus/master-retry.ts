import type { PublishedEvent } from "@tensquads/kernel";

import { chooseAdapters } from "../adapter-choice.ts";
import type { BusObjectEnv, BusStorage } from "./account-bus.ts";

const OPEN_PREFIX = "master-open:";
const DONE_PREFIX = "master-done:";
const RETRY_MS = 1000;

export function masterEvent(event: { readonly kind: string; readonly to: string; readonly from: string }): boolean {
	if (event.to !== "master") return false;
	if (event.kind === "Result") return true;
	return event.kind === "Approval" && event.from === "user";
}

async function rememberRetry(storage: BusStorage): Promise<void> {
	const retryAt = Date.now() + RETRY_MS;
	const current = await storage.getAlarm();
	if (current === null || retryAt < current) await storage.setAlarm(retryAt);
}

export async function finishMaster(
	storage: BusStorage,
	env: BusObjectEnv,
	event: PublishedEvent,
	receipt: boolean,
	run: (event: PublishedEvent) => Promise<void>,
): Promise<void> {
	if (!masterEvent(event) || chooseAdapters(env.ADAPTERS) !== "real") return;
	if (await storage.get(`${DONE_PREFIX}${event.id}`)) return;
	const openKey = `${OPEN_PREFIX}${event.id}`;
	if (!receipt && !(await storage.get(openKey))) return;
	await storage.put(openKey, event);
	try {
		await run(event);
		await storage.delete(openKey);
		await storage.put(`${DONE_PREFIX}${event.id}`, true);
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
	const open = await storage.list<PublishedEvent>({ prefix: OPEN_PREFIX });
	for (const [key, event] of open) {
		if (await storage.get(`${DONE_PREFIX}${event.id}`)) {
			await storage.delete(key);
			continue;
		}
		await finishMaster(storage, env, event, true, (item) => run(accountId, item));
	}
}
